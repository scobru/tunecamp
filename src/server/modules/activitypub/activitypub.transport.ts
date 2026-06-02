import crypto from "crypto";
import { drainResponse, fetchSafe } from "../../common/network.js";
import type { Federation } from "@fedify/fedify";
import type { Artist } from "../../core/database.types.js";

export interface TransportIdentity {
    slug: string;
    private_key?: string;
    public_key?: string;
}

export class ActivityPubTransport {
    constructor(
        private federation: Federation<void>,
        private baseUrl: string,
        private getSiteKeys: () => { privateKey: string | null, publicKey: string | null }
    ) {}

    public async send(actor: Artist | TransportIdentity, inboxUri: string, activity: any): Promise<void> {
        try {
            console.log(`📤 Sending activity ${activity.type || 'unknown'} from ${actor.slug} to ${inboxUri} via Fedify`);
            
            const ctx = this.federation.createContext(new URL(this.baseUrl), undefined);
            await ctx.sendActivity(
                { handle: actor.slug },
                { id: new URL(inboxUri), inboxId: new URL(inboxUri) },
                activity
            );
            
            console.log(`✅ Activity queued/sent to ${inboxUri} via Fedify`);
        } catch (e) {
            console.error(`❌ Fedify failed to send activity to ${inboxUri}, falling back to manual:`, e);
            await this.manualSend(actor, inboxUri, activity);
        }
    }

    private async manualSend(actor: Artist | TransportIdentity, inboxUri: string, activity: any): Promise<void> {
        let activityJson: any;
        if (activity && typeof activity.toJsonLd === 'function') {
            activityJson = await activity.toJsonLd();
        } else {
            activityJson = { ...activity };
        }
        
        if (!activityJson["@context"]) activityJson["@context"] = "https://www.w3.org/ns/activitystreams";
        if (!activityJson.id) activityJson.id = `${this.baseUrl}/activity/${crypto.randomUUID()}`;

        try {
            const res = await this.fetchWithSignature(inboxUri, "post", activityJson, actor);
            if (!res.ok) {
                const errText = await res.text().catch(() => "Unknown error");
                console.error(`❌ Manual fallback failed to send activity to ${inboxUri}: ${res.status} ${errText}`);
            } else {
                await drainResponse(res);
                console.log(`✅ Manually sent activity to ${inboxUri}`);
            }
        } catch (e) {
            console.error(`❌ Error in manual fallback sending activity to ${inboxUri}:`, e);
        }
    }

    public async fetchWithSignature(uri: string, method: "get" | "post" = "get", body: any = null, actor?: Artist | TransportIdentity): Promise<any> {
        const url = new URL(uri);
        const date = new Date().toUTCString();
        let bodyStr = "";
        let digest = "";

        if (body) {
            bodyStr = JSON.stringify(body);
            digest = `SHA-256=${crypto.createHash("sha256").update(bodyStr).digest("base64")}`;
        }

        const headers: any = { 
            "Host": url.host, 
            "Date": date, 
            "Accept": "application/activity+json",
            "User-Agent": "Tunecamp/2.0"
        };

        if (digest) {
            headers["Digest"] = digest;
            headers["Content-Type"] = "application/activity+json";
        }

        let signingActor = actor;
        if (!signingActor || (signingActor.slug === "site" && !signingActor.private_key)) {
            const { privateKey, publicKey } = this.getSiteKeys();
            if (!signingActor) {
                signingActor = { slug: "site", private_key: privateKey || undefined, public_key: publicKey || undefined };
            } else {
                signingActor.private_key = privateKey || undefined;
                signingActor.public_key = publicKey || undefined;
            }
        }

        if (signingActor?.private_key) {
            try {
                headers["Signature"] = this.signRequest(signingActor, url, method, date, digest || undefined);
            } catch (sigErr) {
                console.warn(`⚠️ Could not sign request to ${uri} (Actor: ${signingActor.slug}):`, sigErr);
            }
        }

        return fetchSafe(uri, { method: method.toUpperCase(), headers, body: body ? bodyStr : undefined });
    }

    private signRequest(actor: Artist | TransportIdentity, url: URL, method: string, date: string, digest?: string): string {
        if (!actor.private_key) throw new Error(`Actor ${actor.slug} has no private key`);
        
        let headersList = "(request-target) host date";
        const targetPath = url.pathname + (url.search || "");
        let stringToSign = `(request-target): ${method.toLowerCase()} ${targetPath}\nhost: ${url.host}\ndate: ${date}`;
        
        if (digest) {
            headersList += " digest";
            stringToSign += `\ndigest: ${digest}`;
        }

        const signer = crypto.createSign("sha256");
        signer.update(stringToSign);
        const signature = signer.sign(actor.private_key, "base64");
        
        const keyId = `${this.baseUrl}/users/${actor.slug}#main-key`;
        return `keyId="${keyId}",algorithm="rsa-sha256",headers="${headersList}",signature="${signature}"`;
    }
}
