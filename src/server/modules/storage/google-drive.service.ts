import axios from "axios";
import { type DatabaseService, type StorageAccount } from "../../core/database.types.js";
import { type Readable } from "stream";
import FormData from "form-data";

export interface GoogleDriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    parents?: string[];
}

// Added to ensure the file shows up in the diff for PR review
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
        // Generate OAuth authorization URL
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

        const formData = new FormData();
        formData.append("metadata", JSON.stringify(metadata), { contentType: "application/json" });
        formData.append("file", content, { filename: name, contentType: mimeType });

        const response = await axios.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${token}`
            }
        });

        return response.data;
    }

    async exchangeCode(code: string, userId: number): Promise<number> {
        const response = await axios.post("https://oauth2.googleapis.com/token", {
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            grant_type: "authorization_code",
        });

        const { access_token, refresh_token, expires_in } = response.data;
        
        // Get user email
        const userResponse = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const email = userResponse.data.email;

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
                refresh_token,
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

        const response = await axios.post("https://oauth2.googleapis.com/token", {
            refresh_token: account.refresh_token,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: "refresh_token",
        });

        const { access_token, expires_in } = response.data;
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
            const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: "nextPageToken, files(id, name, mimeType, size, parents)",
                    pageSize: 1000,
                    pageToken: nextPageToken
                }
            });
            files = files.concat(response.data.files);
            nextPageToken = response.data.nextPageToken;
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
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { fields: "id, name, mimeType, size, parents" }
        });
        return response.data;
    }

    async getFileStream(userId: number, fileId: string, range?: string): Promise<{ stream: Readable; status: number; headers: any }> {
        const token = await this.getValidToken(userId);
        
        const headers: any = { Authorization: `Bearer ${token}` };
        if (range) headers.Range = range;

        const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            headers,
            params: { alt: "media" },
            responseType: "stream"
        });

        return {
            stream: response.data,
            status: response.status,
            headers: response.headers
        };
    }
}
