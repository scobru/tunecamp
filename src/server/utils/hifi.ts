import fetch from "node-fetch";

const HIFI_INSTANCES = [
  'https://api.monochrome.tf',
  'https://monochrome-api.samidy.com',
  'https://hifi.geeked.wtf',
  'https://lossless.wtf',
  'https://if-it-runs-ship-it.lol',
  'https://tidal.kinoplus.online',
  'https://wolf.qqdl.site',
  'https://maus.qqdl.site',
  'https://vogel.qqdl.site',
  'https://katze.qqdl.site',
  'https://hund.qqdl.site',
];

const TIDAL_IMAGE_BASE = 'https://resources.tidal.com/images';

class InstanceRing {
  private instances: string[];
  private index = 0;

  constructor(instances: string[]) {
    this.instances = instances;
  }

  get size(): number {
    return this.instances.length;
  }

  current(): string {
    return this.instances[this.index];
  }

  next(): string {
    this.index = (this.index + 1) % this.instances.length;
    return this.current();
  }

  reset(): void {
    this.index = 0;
  }
}

const instanceRing = new InstanceRing(HIFI_INSTANCES);

export function getTidalCoverUrl(uuid: string, size = 320): string {
    return `${TIDAL_IMAGE_BASE}/${uuid.replace(/-/g, '/')}/${size}x${size}.jpg`;
}

export class HiFiClient {
  private async request<T>(
    path: string,
    params: Record<string, string> = {},
    attempt = 0
  ): Promise<T> {
    if (attempt === 0) {
      instanceRing.reset();
    }

    if (attempt >= instanceRing.size) {
      throw new Error(`All HiFi API instances failed for ${path}`);
    }

    const url = new URL(path, instanceRing.current());
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(5000) // Don't wait too long for dead instances
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error(`Invalid content type: ${contentType}`);
        }
        return await response.json() as Promise<T>;
      }
      
      if (response.status >= 500) {
        return this.retry<T>(path, params, attempt);
      }
      
      throw new Error(`HiFi API error: ${response.status} from ${url.toString()}`);
    } catch (e) {
      return this.retry<T>(path, params, attempt);
    }
  }

  private async retry<T>(
    path: string,
    params: Record<string, string>,
    attempt: number
  ): Promise<T> {
    instanceRing.next();
    await new Promise(r => setTimeout(r, 200 * attempt));
    return this.request<T>(path, params, attempt + 1);
  }

  async searchTracks(query: string, limit = 20): Promise<any> {
    return this.request('/search', { s: query, limit: String(limit) });
  }

  async getTrackPlayback(trackId: string | number, quality = 'LOSSLESS'): Promise<any> {
    const playback = await this.request<any>('/track', { id: String(trackId), quality });
    if (playback.data && playback.data.manifest) {
        try {
            const manifest = JSON.parse(Buffer.from(playback.data.manifest, 'base64').toString('utf8'));
            if (manifest.urls && manifest.urls.length > 0) {
                return { ...playback.data, streamUrl: manifest.urls[0] };
            }
        } catch (e) {
            console.error(`[HiFi] Failed to parse manifest:`, e);
        }
    }
    return playback.data;
  }

  async getCover(trackId: string | number): Promise<any> {
    return this.request('/cover', { id: String(trackId) });
  }
}

export const hifiClient = new HiFiClient();
