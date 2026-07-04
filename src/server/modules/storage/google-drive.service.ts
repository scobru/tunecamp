import { type DatabaseService, type StorageAccount } from "../../core/database.types.js";
import { Readable } from "stream";

export interface GoogleDriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    parents?: string[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return res.json() as Promise<T>;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: any[] = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export class GoogleDriveService {
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor(
        private database: DatabaseService,
        config: { clientId: string; clientSecret: string; redirectUri: string }
    ) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.redirectUri = config.redirectUri;
    }

    getAuthUrl(state?: string): string {
        const scopes = [
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/userinfo.email"
        ];
        let url = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.clientId}` +
            `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scopes.join(" "))}` +
            `&access_type=offline` +
            `&prompt=consent`;
        
        if (state) {
            url += `&state=${encodeURIComponent(state)}`;
        }
        
        return url;
    }

    async uploadFile(userId: number, name: string, mimeType: string, content: Readable | Buffer): Promise<GoogleDriveFile> {
        const token = await this.getValidToken(userId);
        
        const metadata = {
            name,
            mimeType,
        };

        let fileContent: Blob;
        if (Buffer.isBuffer(content)) {
            fileContent = new Blob([content], { type: mimeType });
        } else {
            const buf = await streamToBuffer(content);
            fileContent = new Blob([buf], { type: mimeType });
        }

        const formData = new FormData();
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        formData.append("file", fileContent, name);

        return fetchJson<GoogleDriveFile>("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });
    }

    async exchangeCode(code: string, userId: number): Promise<number> {
        const tokenData = await fetchJson<{ access_token: string; refresh_token?: string; expires_in: number }>(
            "https://oauth2.googleapis.com/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri,
                    grant_type: "authorization_code",
                })
            }
        );

        const { access_token, refresh_token, expires_in } = tokenData;
        
        // Get user email
        const userData = await fetchJson<{ email: string }>(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            {
                headers: { Authorization: `Bearer ${access_token}` }
            }
        );
        const email = userData.email;

        const expiryDate = Date.now() + expires_in * 1000;

        const existing = this.database.getStorageAccountByProvider(userId, "google");
        if (existing) {
            this.database.updateStorageAccount(existing.id, {
                access_token,
                refresh_token: refresh_token || existing.refresh_token,
                expiry_date: expiryDate,
                account_email: email
            });
            return existing.id;
        } else {
            return this.database.createStorageAccount({
                user_id: userId,
                provider: "google",
                account_email: email,
                access_token,
                refresh_token: refresh_token || "",
                expiry_date: expiryDate
            });
        }
    }

    async getValidToken(userId: number): Promise<string> {
        const account = this.database.getStorageAccountByProvider(userId, "google");
        if (!account) throw new Error("Google Drive account not connected");

        if (account.expiry_date && account.expiry_date > Date.now() + 60000) {
            return account.access_token;
        }

        if (!account.refresh_token) throw new Error("No refresh token available");

        const tokenData = await fetchJson<{ access_token: string; expires_in: number }>(
            "https://oauth2.googleapis.com/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    refresh_token: account.refresh_token,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: "refresh_token",
                })
            }
        );

        const { access_token, expires_in } = tokenData;
        const expiryDate = Date.now() + expires_in * 1000;

        this.database.updateStorageAccount(account.id, {
            access_token,
            expiry_date: expiryDate
        });

        return access_token;
    }

    async listFiles(userId: number, folderId = "root"): Promise<GoogleDriveFile[]> {
        const token = await this.getValidToken(userId);
        let files: GoogleDriveFile[] = [];
        let nextPageToken: string | undefined;

        do {
            const params = new URLSearchParams({
                q: `'${folderId}' in parents and trashed = false`,
                fields: "nextPageToken, files(id, name, mimeType, size, parents)",
                pageSize: "1000",
            });
            if (nextPageToken) params.set("pageToken", nextPageToken);

            const data = await fetchJson<{ files: GoogleDriveFile[]; nextPageToken?: string }>(
                `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            files = files.concat(data.files);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        return files;
    }

    async listAudioFilesRecursive(userId: number, folderId = "root"): Promise<GoogleDriveFile[]> {
        const audioFiles: GoogleDriveFile[] = [];
        const queue: string[] = [folderId];
        
        while (queue.length > 0) {
            const currentFolderId = queue.shift()!;
            try {
                const files = await this.listFiles(userId, currentFolderId);
                for (const file of files) {
                    if (file.mimeType === "application/vnd.google-apps.folder") {
                        queue.push(file.id);
                    } else {
                        const isAudio = file.mimeType.startsWith("audio/") || 
                                        /\.(mp3|wav|flac|m4a|ogg)$/i.test(file.name);
                        if (isAudio) {
                            audioFiles.push(file);
                        }
                    }
                }
            } catch (err) {
                console.error(`[GDrive] Failed to list folder ${currentFolderId}:`, err);
            }
        }
        
        return audioFiles;
    }

    async getFile(userId: number, fileId: string): Promise<GoogleDriveFile> {
        const token = await this.getValidToken(userId);
        return fetchJson<GoogleDriveFile>(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent("id, name, mimeType, size, parents")}`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
    }

    async getFileStream(userId: number, fileId: string, range?: string): Promise<{ stream: Readable; status: number; headers: any }> {
        const token = await this.getValidToken(userId);
        
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (range) headers.Range = range;

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const stream = res.body ? Readable.fromWeb(res.body as any) : new Readable();
        
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
            responseHeaders[k] = v;
        });

        return {
            stream,
            status: res.status,
            headers: responseHeaders
        };
    }
}
