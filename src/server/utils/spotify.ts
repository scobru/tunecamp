import { webcrypto as crypto } from "node:crypto";

// ─── Constants (Decoded from Nuclear plugin) ─────────────────────────────────
const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
const TOKEN_URL = "https://open.spotify.com/api/token";
const SERVER_TIME_URL = "https://open.spotify.com/api/server-time";
const PLAYLIST_URI_PREFIX = "spotify:playlist:";
const PLAYLIST_HOSTNAME = "open.spotify.com";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_USER_AGENT,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: "https://open.spotify.com",
  Referer: "https://open.spotify.com/",
};

const OPERATION_HASHES: Record<string, string> = {
  searchArtists: '0e6f9020a66fe15b93b3bb5c7e6484d1d8cb3775963996eaede72bac4d97e909',
  searchAlbums: 'a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2',
  searchTracks: 'bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428',
  queryArtistOverview: '1ac33ddab5d39a3a9c27802774e6d78b9405cc188c6f75aed007df2a32737c72',
  getAlbum: '97dd13a1f28c80d66115a13697a7ffd94fe3bebdb94da42159456e1d82bfee76',
  fetchPlaylist: 'e578eda4f77aae54294a48eac85e2a42ddb203faf6ea12b3fddaec5aa32918a3',
  fetchPlaylistContents: 'c56c706a062f82052d87fdaeeb300a258d2d54153222ef360682a0ee625284d9',
};

// ─── TOTP & Secrets Logic ───────────────────────────────────────────────────
const TOTP_LOCAL_PERIOD = 30;
const TOTP_SERVER_PERIOD = 900;
const XOR_MODULO = 33;
const XOR_OFFSET = 9;
const TOTP_DIGITS = 6;

const ENCODED_SECRETS = [
  { secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N', version: 61 },
  { secret: 'OmE{ZA.J^":0FG\\Uz?[@WW', version: 60 },
  { secret: '{iOFn;4}<1PFYKPV?5{%u14]M>/V0hDH', version: 59 },
];

const xorDecode = (charCode: number, index: number): number =>
  charCode ^ ((index % XOR_MODULO) + XOR_OFFSET);

function decodeStringSecret(encoded: string): string {
    const values = encoded.split('').map((char) => char.charCodeAt(0));
    const decoded = values.map((value, index) => xorDecode(value, index));
    const joined = decoded.join('');
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(joined);
    return Array.from(utf8Bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function generateTotp(hexSecret: string, timeSec: number, period: number): Promise<string> {
  const counter = Math.floor(timeSec / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const secretBytes = Buffer.from(hexSecret, "hex");
  const key = await (crypto as any).subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await (crypto as any).subtle.sign('HMAC', key, counterBuffer);
  const digest = new Uint8Array(signature);

  const truncationOffset = digest[digest.length - 1] & 0x0f;
  const truncated =
    ((digest[truncationOffset] & 0x7f) << 24) |
    ((digest[truncationOffset + 1] & 0xff) << 16) |
    ((digest[truncationOffset + 2] & 0xff) << 8) |
    (digest[truncationOffset + 3] & 0xff);

  const code = truncated % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, '0');
}

// ─── Auth Client ────────────────────────────────────────────────────────────
class AuthClient {
    private cachedToken: { accessToken: string; expiresAt: number } | null = null;
    private failedSecretVersions: Set<number> = new Set();

    async getAccessToken(): Promise<string> {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
            return this.cachedToken.accessToken;
        }
        return this.fetchAccessToken();
    }

    private async fetchAccessToken(): Promise<string> {
        // Try built-in secrets
        for (const entry of ENCODED_SECRETS) {
            if (this.failedSecretVersions.has(entry.version)) continue;
            try {
                const hexSecret = decodeStringSecret(entry.secret);
                const serverTimeRes = await fetch(SERVER_TIME_URL, { headers: BROWSER_HEADERS });
                if (!serverTimeRes.ok) throw new Error("Server time fetch failed");
                const { serverTime } = await serverTimeRes.json() as any;
                
                const localTimeSec = Math.floor(Date.now() / 1000);
                const totp = await generateTotp(hexSecret, localTimeSec, TOTP_LOCAL_PERIOD);
                const totpServer = await generateTotp(hexSecret, serverTime, TOTP_SERVER_PERIOD);

                const url = new URL(TOKEN_URL);
                url.searchParams.set('reason', 'init');
                url.searchParams.set('productType', 'web-player');
                url.searchParams.set('totp', totp);
                url.searchParams.set('totpVer', entry.version.toString());
                url.searchParams.set('totpServer', totpServer);

                const res = await fetch(url.toString(), { headers: BROWSER_HEADERS });
                if (res.ok) {
                    const data = await res.json() as any;
                    this.cachedToken = {
                        accessToken: data.accessToken,
                        expiresAt: data.accessTokenExpirationTimestampMs
                    };
                    return data.accessToken;
                }
                this.failedSecretVersions.add(entry.version);
            } catch (e) {
                console.error(`[SpotifyAuth] Version ${entry.version} failed:`, e);
            }
        }
        throw new Error("Failed to obtain Spotify access token");
    }
}

const auth = new AuthClient();

// ─── Metadata Client ────────────────────────────────────────────────────────
export class SpotifyMetadataClient {
    async query<T>(operationName: string, variables: any): Promise<T> {
        const token = await auth.getAccessToken();
        const body = JSON.stringify({
            operationName,
            variables,
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: OPERATION_HASHES[operationName],
                },
            },
        });

        const res = await fetch(PATHFINDER_URL, {
            method: 'POST',
            headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body
        });

        if (!res.ok) throw new Error(`Spotify Pathfinder API error: ${res.status}`);
        return res.json() as Promise<T>;
    }

    async searchTracks(query: string, limit = 20) {
        const data = await this.query<any>('searchTracks', {
            searchTerm: query,
            limit,
            offset: 0,
            numberOfTopResults: limit,
            includeAudiobooks: false,
            includeArtistHasConcertsField: false,
            includePreReleases: false,
        });
        return data.data.searchV2.tracksV2.items.map((i: any) => i.item.data);
    }

    async getPlaylist(id: string) {
        try {
            const data = await this.query<any>('fetchPlaylist', {
                uri: `spotify:playlist:${id}`,
                offset: 0,
                limit: 100
            });
            if (data?.data?.playlistV2) return data.data.playlistV2;
        } catch (e) {
            console.warn(`[Spotify] fetchPlaylist failed for ${id}, trying contents fallback...`);
        }
        
        // Fallback or secondary fetch for contents
        const contents = await this.query<any>('fetchPlaylistContents', {
            uri: `spotify:playlist:${id}`,
            offset: 0,
            limit: 100
        });
        return contents.data.playlistV2;
    }
}

export const isSpotifyPlaylistUrl = (url: string): boolean => {
    try {
        if (url.startsWith(PLAYLIST_URI_PREFIX)) return true;
        const parsed = new URL(url);
        return (
            parsed.hostname === PLAYLIST_HOSTNAME &&
            /^\/playlist\/[a-zA-Z0-9]+/.test(parsed.pathname)
        );
    } catch {
        return false;
    }
};

export const extractSpotifyPlaylistId = (url: string): string => {
    if (url.startsWith(PLAYLIST_URI_PREFIX)) return url.split(':')[2];
    const parsed = new URL(url);
    return parsed.pathname.split('/')[2];
};
