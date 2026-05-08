import { Scanner } from "../scanner.js";
import { DatabaseService } from "../database.js";
import { getZen, Zen } from "../zen.js";
import type { ServerConfig } from "../config.js";
import type { OpenRouterService } from "./openrouter.service.js";
import path from "path";
import fs from "fs-extra";
import axios from "axios";
import crypto from "crypto";

/**
 * LindaBotService implements a bridge to the Linda (Signal) decentralized messaging platform.
 * Refactored to work with Linda Groups (Rooms) via invite links.
 */
export class LindaBotService {
    private zen: any = null;
    private botPair: any = null;
    private isRunning = false;
    private processedRef = new Set<string>();

    constructor(
        private database: DatabaseService,
        private scanner: Scanner,
        private config: ServerConfig,
        private ai?: OpenRouterService
    ) {}

    async start() {
        if (this.isRunning) return;

        const isEnabled = this.database.getSetting("linda_bot_enabled") === 'true';
        if (!isEnabled) return;

        console.log("🤖 [LindaBot] Starting Linda bridge...");

        try {
            // 1. Get or Create Stable Bot Identity
            // We derive it from the jwtSecret to ensure it's stable across restarts
            // but unique to this server instance.
            const seed = this.config.jwtSecret + "_linda_bot";
            const hash = crypto.createHash('sha256').update(seed).digest();
            
            // Note: In a real Zen environment, we'd use SEA.pair() with a seed.
            // For now, we'll try to find a stored pair or generate one if missing.
            const storedPairStr = this.database.getSetting("linda_bot_pair");
            if (storedPairStr) {
                try {
                    this.botPair = JSON.parse(storedPairStr);
                } catch (e) {}
            }

            if (!this.botPair) {
                // Generate a new one if not found (first time)
                // In the future, we could make this deterministic from seed
                this.botPair = await (Zen as any).pair();
                this.database.setSetting("linda_bot_pair", JSON.stringify(this.botPair));
                this.database.setSetting("linda_bot_pubkey", this.botPair.pub);
                console.log("🔐 [LindaBot] Generated new identity:", this.botPair.pub.slice(0, 8));
            } else {
                this.database.setSetting("linda_bot_pubkey", this.botPair.pub);
            }

            // 2. Initialize Zen
            this.zen = getZen({
                peers: this.config.zenPeers,
            });

            const user = this.zen.user();
            
            // 3. Authenticate
            user.auth(this.botPair);
            console.log(`✅ [LindaBot] Authenticated as: ${this.botPair.pub.slice(0, 8)}...`);

            // 4. Handle Group Join
            const inviteLink = this.database.getSetting("linda_invite_link");
            if (inviteLink) {
                const invite = this.parseInvite(inviteLink);
                if (invite) {
                    console.log(`[LindaBot] Joining group: ${invite.groupId.slice(0, 8)}`);
                    await this.joinGroup(invite);
                    
                    // 5. Listen to Group Messages
                    const groupPath = `linda_rooms/${invite.groupId}/messages`;
                    this.zen.get(groupPath).map().on(async (data: any, gunKey: string) => {
                        if (!data || typeof data !== "object" || !data.body || !data.sender) return;
                        if (data.sender === this.botPair.pub) return;
                        if (this.processedRef.has(gunKey)) return;
                        this.processedRef.add(gunKey);

                        // Skip old messages (older than 1 minute before start)
                        const msgTime = new Date(data.timestamp).getTime();
                        if (msgTime < Date.now() - 60000) return;

                        this.handleUpdate(data, invite);
                    });
                } else {
                    console.warn("[LindaBot] Invalid invite link provided.");
                }
            } else {
                console.log("ℹ️ [LindaBot] No group invite link configured. Operating in stand-by.");
            }

            this.isRunning = true;
            console.log("🚀 [LindaBot] Linda bridge active.");

        } catch (err) {
            console.error("❌ [LindaBot] Failed to start:", err);
        }
    }

    private parseInvite(inviteB64: string) {
        try {
            const cleanInviteB64 = inviteB64.trim().replace(/ /g, "+");
            let jsonStr = "";
            try {
                jsonStr = Buffer.from(cleanInviteB64, 'base64').toString('utf-8');
            } catch (e) {
                // Try URL decode if needed
                jsonStr = decodeURIComponent(escape(Buffer.from(cleanInviteB64, 'base64').toString('binary')));
            }
            const invite = JSON.parse(jsonStr);
            if (invite && invite.g) {
                return {
                    groupId: invite.g,
                    secret: invite.s,
                    role: invite.r || 'peer'
                };
            }
        } catch (e) {}
        return null;
    }

    private async joinGroup(invite: any) {
        const memberPath = `linda_rooms/${invite.groupId}/members/${this.botPair.pub}`;
        const memberData = {
            role: invite.role || 'peer',
            joinedAt: Date.now()
        };
        return new Promise<void>((resolve) => {
            this.zen.get(memberPath).put(memberData, (ack: any) => resolve());
            setTimeout(resolve, 2000);
        });
    }

    private async handleUpdate(data: any, invite: any) {
        const sender = data.sender;
        let body = data.body;

        // Attempt decryption if body looks like a base64 blob and we have a secret
        if (invite.secret && typeof body === 'string' && !body.startsWith('/') && !body.includes(' ')) {
             const decrypted = await this.decrypt(body, invite.secret);
             if (decrypted) body = decrypted;
        }

        if (typeof body !== 'string') return;

        console.log(`📩 [LindaBot] Group Message from ${sender.slice(0, 8)}: ${body.slice(0, 50)}`);

        // Check for commands
        const text = body.trim();
        if (text.startsWith('/')) {
            const parts = text.split(' ');
            const cmd = parts[0].substring(1).toLowerCase();
            const query = parts.slice(1).join(' ');

            if (cmd === 'search' || cmd === 'play') {
                await this.handleSearch(invite, query);
            } else if (cmd === 'status') {
                await this.sendToGroup(invite, "✅ Tunecamp Linda Bridge is online and ready!");
            }
        }
    }

    private async handleSearch(invite: any, query: string) {
        if (!query) {
            return this.sendToGroup(invite, "🔍 Please provide a search query. (e.g. /search lofi)");
        }

        console.log(`🔎 [LindaBot] Group Search for: "${query}"`);
        const searchResults = this.database.search(query, false);
        const tracks = searchResults.tracks.slice(0, 3);

        if (tracks.length === 0) {
            return this.sendToGroup(invite, `❌ No results found for "${query}"`);
        }

        for (const track of tracks) {
            await this.forwardTrack(track);
        }
    }

    /**
     * Forwards a track to a Linda recipient or the configured group.
     */
    async forwardTrack(track: any, recipient?: string) {
        const inviteLink = this.database.getSetting("linda_invite_link");
        const invite = inviteLink ? this.parseInvite(inviteLink) : null;

        const publicUrl = this.database.getSetting("publicUrl") || `http://localhost:${this.config.port}`;
        const streamUrl = `${publicUrl}/api/tracks/${track.id}/stream`;
        
        let textBody = `🎵 ${track.artist_name || 'Unknown'} - ${track.title}\n${streamUrl}`;
        let encryptedBody = textBody;

        if (recipient) {
            // P2P Forwarding (Inbox)
            const message = {
                type: "audio",
                sender: this.botPair.pub,
                body: streamUrl,
                audio: streamUrl,
                text: textBody,
                timestamp: new Date().toISOString(),
                msgId: `tc_${track.id}_${Date.now()}`
            };

            const path = `linda_v3_inbox_${recipient}`;
            return new Promise<void>((resolve) => {
                this.zen.get(path).get(message.msgId).put(message, (ack: any) => resolve());
                setTimeout(resolve, 3000);
            });
        } else if (invite) {
            // Group Forwarding
            if (invite.secret) {
                encryptedBody = await this.encrypt(textBody, invite.secret);
            }

            const message = {
                type: "audio",
                sender: this.botPair.pub,
                body: encryptedBody,
                audio: streamUrl,
                text: textBody,
                timestamp: new Date().toISOString(),
                msgId: `tc_${track.id}_${Date.now()}`
            };

            const path = `linda_rooms/${invite.groupId}/messages`;
            return new Promise<void>((resolve) => {
                this.zen.get(path).get(message.msgId).put(message, (ack: any) => {
                    if (!ack.err) console.log(`📤 [LindaBot] Track ${track.id} forwarded to group.`);
                    resolve();
                });
                setTimeout(resolve, 3000);
            });
        }
    }

    private async sendToGroup(invite: any, text: string) {
        let body = text;
        if (invite.secret) {
            body = await this.encrypt(text, invite.secret);
        }

        const message = {
            type: "text",
            sender: this.botPair.pub,
            body: body,
            timestamp: new Date().toISOString(),
            msgId: `tc_txt_${Date.now()}`
        };

        const path = `linda_rooms/${invite.groupId}/messages`;
        return new Promise<void>((resolve) => {
            this.zen.get(path).get(message.msgId).put(message, () => resolve());
            setTimeout(resolve, 3000);
        });
    }

    // --- LITE CRYPTO HELPERS ---

    private async encrypt(plaintext: string, secretB64: string): Promise<string> {
        try {
            const key = Buffer.from(secretB64, 'base64').slice(0, 32);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            return Buffer.concat([iv, encrypted, tag]).toString('base64');
        } catch (e) {
            return plaintext;
        }
    }

    private async decrypt(ciphertextB64: string, secretB64: string): Promise<string | null> {
        try {
            const key = Buffer.from(secretB64, 'base64').slice(0, 32);
            const data = Buffer.from(ciphertextB64, 'base64');
            const iv = data.slice(0, 12);
            const tag = data.slice(data.length - 16);
            const encrypted = data.slice(12, data.length - 16);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        } catch (e) {
            return null;
        }
    }

    getBotPubKey(): string | null {
        return this.botPair?.pub || null;
    }
}
