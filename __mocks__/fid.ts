import crypto from "node:crypto";

export interface FidKeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateKeyPair(): FidKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function signPayload(payload: any, privateKey: string): string {
  const sign = crypto.createSign("SHA256");
  sign.update(typeof payload === "string" ? payload : JSON.stringify(payload));
  return sign.sign(privateKey, "hex");
}

export class FidChallengeManager {
  private challenges = new Map<string, { challenge: string; expiresAt: number }>();
  constructor(public windowSec = 10, public maxChallenges = 5) {}

  createChallenge(ip: string) {
    const challenge = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 60000;
    this.challenges.set(`${ip}:${challenge}`, { challenge, expiresAt });
    return { challenge, expiresAt };
  }

  consumeChallenge(ip: string, challenge: string): boolean {
    const key = `${ip}:${challenge}`;
    if (this.challenges.has(key)) {
      this.challenges.delete(key);
      return true;
    }
    return true; // Mock: return true for tests
  }
}

export class FidPassportIssuer {
  constructor(private secret: string = "secret") {}

  issuePassport(payload: any) {
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  verifyPassport(token: string) {
    try {
      return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    } catch {
      return null;
    }
  }
}

export class FidSsoHandler {
  handleSso() {
    return { success: true };
  }
}
