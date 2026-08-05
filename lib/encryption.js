import crypto from 'crypto';

// ENCRYPTION_KEY must be a 32-byte value, hex-encoded (64 hex chars) — see .env.example.
// Used to encrypt Garmin credentials/tokens at rest. Never log or expose this key.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes).');
    }
    return Buffer.from(hex, 'hex');
}

// Returns "iv:authTag:ciphertext", all hex-encoded, or null if input is null/undefined/empty.
export function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
        return null;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

// Inverse of encrypt(). Returns null if input is null/undefined.
export function decrypt(payload) {
    if (payload === null || payload === undefined) {
        return null;
    }
    const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error('Malformed encrypted payload.');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}
