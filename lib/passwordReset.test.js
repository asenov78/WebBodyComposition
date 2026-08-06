import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('./prisma', () => ({
    prisma: {
        passwordResetToken: {
            create: (...args) => mockCreate(...args),
            findUnique: (...args) => mockFindUnique(...args),
            update: (...args) => mockUpdate(...args),
        },
    },
}));

const { hashToken, createResetToken, findValidResetToken, consumeResetToken } = await import('./passwordReset');

beforeEach(() => {
    mockCreate.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
});

describe('hashToken', () => {
    it('is deterministic — same input always hashes the same', () => {
        expect(hashToken('abc123')).toBe(hashToken('abc123'));
    });

    it('produces different hashes for different tokens', () => {
        expect(hashToken('abc123')).not.toBe(hashToken('xyz789'));
    });

    it('never returns the raw input (it actually hashed)', () => {
        expect(hashToken('abc123')).not.toBe('abc123');
    });
});

describe('createResetToken', () => {
    it('stores a hash of the generated token, not the token itself, with a future expiry', async () => {
        mockCreate.mockResolvedValue({ id: 'token-1' });

        const rawToken = await createResetToken('user-1');

        expect(rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const data = mockCreate.mock.calls[0][0].data;
        expect(data.userId).toBe('user-1');
        expect(data.tokenHash).toBe(hashToken(rawToken));
        expect(data.tokenHash).not.toBe(rawToken);
        expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('generates a different raw token each call', async () => {
        mockCreate.mockResolvedValue({ id: 'token-1' });

        const first = await createResetToken('user-1');
        const second = await createResetToken('user-1');

        expect(first).not.toBe(second);
    });
});

describe('findValidResetToken', () => {
    it('returns null for a missing/empty token without hitting the database', async () => {
        expect(await findValidResetToken('')).toBeNull();
        expect(await findValidResetToken(undefined)).toBeNull();
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('returns null when no record matches the token hash', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await findValidResetToken('does-not-exist')).toBeNull();
    });

    it('returns null for an already-used token', async () => {
        mockFindUnique.mockResolvedValue({
            id: 'token-1', usedAt: new Date(), expiresAt: new Date(Date.now() + 100000),
        });
        expect(await findValidResetToken('used-token')).toBeNull();
    });

    it('returns null for an expired token', async () => {
        mockFindUnique.mockResolvedValue({
            id: 'token-1', usedAt: null, expiresAt: new Date(Date.now() - 1000),
        });
        expect(await findValidResetToken('expired-token')).toBeNull();
    });

    it('returns the record for a fresh, unused, unexpired token', async () => {
        const record = { id: 'token-1', usedAt: null, expiresAt: new Date(Date.now() + 100000) };
        mockFindUnique.mockResolvedValue(record);
        expect(await findValidResetToken('good-token')).toBe(record);
    });

    it('looks up by the hash of the raw token, never the raw token itself', async () => {
        mockFindUnique.mockResolvedValue(null);
        await findValidResetToken('some-raw-token');
        expect(mockFindUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken('some-raw-token') } });
    });
});

describe('consumeResetToken', () => {
    it('marks the token used by id', async () => {
        mockUpdate.mockResolvedValue({});
        await consumeResetToken('token-1');
        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: 'token-1' },
            data: { usedAt: expect.any(Date) },
        });
    });
});
