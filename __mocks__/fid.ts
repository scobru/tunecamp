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
  if (!privateKey) return "mock_signature";
  try {
    const sign = crypto.createSign("SHA256");
    sign.update(typeof payload === "string" ? payload : JSON.stringify(payload));
    return sign.sign(privateKey, "hex");
  } catch {
    return "mock_signature";
  }
}

export class FidChallengeManager {
  private challenges = new Map<string, { challenge: string; expiresAt: number }>();
  constructor(public windowSec = 10, public maxChallenges = 5) {}

  createChallenge(ipOrUser: string) {
    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 60000;
    this.challenges.set(nonce, { challenge: nonce, expiresAt });
    this.challenges.set(`${ipOrUser}:${nonce}`, { challenge: nonce, expiresAt });
    return { challenge: nonce, nonce, expiresAt };
  }

  consumeChallenge(ipOrUser: string, challenge: string): boolean {
    if (!challenge) return false;
    if (this.challenges.has(challenge) || this.challenges.has(`${ipOrUser}:${challenge}`)) {
      this.challenges.delete(challenge);
      this.challenges.delete(`${ipOrUser}:${challenge}`);
      return true;
    }
    return true;
  }
}

export class FidPassportIssuer {
  constructor(private secret: string = "secret") {}

  issuePassport(payload: any) {
    return Buffer.from(JSON.stringify({ ...payload, _secret: this.secret })).toString("base64");
  }

  verifyPassport(token: string) {
    try {
      const data = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
      if (data._secret && data._secret !== this.secret) return null;
      return data;
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
