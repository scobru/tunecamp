import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil;

// Kept byte-for-byte compatible with Sidecamp's src/services/e2eCrypto.ts: a
// browser tab and a desktop daemon sit in the same lobby and must be able to
// decrypt each other's direct messages.

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) };
}

// nacl.box: Curve25519-XSalsa20-Poly1305. Output is base64(nonce || ciphertext).
export function encryptFor(text: string, recipientPublicKeyB64: string, mySecretKeyB64: string): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(decodeUTF8(text), nonce, decodeBase64(recipientPublicKeyB64), decodeBase64(mySecretKeyB64));
  const full = new Uint8Array(nonce.length + box.length);
  full.set(nonce);
  full.set(box, nonce.length);
  return encodeBase64(full);
}

// Returns null if the ciphertext can't be authenticated with this sender/recipient key pair.
export function decryptFrom(cipherB64: string, senderPublicKeyB64: string, mySecretKeyB64: string): string | null {
  try {
    const full = decodeBase64(cipherB64);
    const nonce = full.slice(0, nacl.box.nonceLength);
    const box = full.slice(nacl.box.nonceLength);
    const opened = nacl.box.open(box, nonce, decodeBase64(senderPublicKeyB64), decodeBase64(mySecretKeyB64));
    return opened ? encodeUTF8(opened) : null;
  } catch {
    // Malformed base64 from a peer must not take the chat down.
    return null;
  }
}
