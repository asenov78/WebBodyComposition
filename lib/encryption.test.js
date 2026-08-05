import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './encryption';

beforeAll(() => {
    // 32-byte key, 64 hex chars — matches the format lib/encryption.js requires.
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('encrypt/decrypt', () => {
    it('round-trips a plain string', () => {
        const plaintext = 'hunter2';
        const encrypted = encrypt(plaintext);
        expect(encrypted).not.toBe(plaintext);
        expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('round-trips a long value (an OAuth token-sized string)', () => {
        const plaintext = 'V1:' + 'x'.repeat(300);
        expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it('produces a different ciphertext each time (random IV)', () => {
        const a = encrypt('same-input');
        const b = encrypt('same-input');
        expect(a).not.toBe(b);
        expect(decrypt(a)).toBe('same-input');
        expect(decrypt(b)).toBe('same-input');
    });

    it('returns null for null/undefined/empty input instead of throwing', () => {
        expect(encrypt(null)).toBeNull();
        expect(encrypt(undefined)).toBeNull();
        expect(encrypt('')).toBeNull();
        expect(decrypt(null)).toBeNull();
        expect(decrypt(undefined)).toBeNull();
    });

    it('throws on a malformed encrypted payload instead of silently returning garbage', () => {
        expect(() => decrypt('not-a-valid-payload')).toThrow();
    });

    it('throws if the auth tag was tampered with (ciphertext integrity check)', () => {
        const encrypted = encrypt('sensitive-value');
        const [iv, authTag, ciphertext] = encrypted.split(':');
        const tamperedAuthTag = authTag.slice(0, -2) + (authTag.slice(-2) === '00' ? '01' : '00');
        expect(() => decrypt(`${iv}:${tamperedAuthTag}:${ciphertext}`)).toThrow();
    });

    it('throws when ENCRYPTION_KEY is missing or the wrong length', () => {
        const original = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = 'too-short';
        expect(() => encrypt('x')).toThrow();
        process.env.ENCRYPTION_KEY = original;
    });
});
