import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests authOptions.providers[0]'s authorize() directly rather than going through
// the NextAuth HTTP handler — authorize() is our own code (rate limiting +
// bcrypt), the rest is NextAuth's own machinery.

const mockFindUnique = vi.fn();
const mockBcryptCompare = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('../../../lib/prisma', () => ({
    prisma: { user: { findUnique: (...args) => mockFindUnique(...args) } },
}));
vi.mock('bcryptjs', () => ({
    default: { compare: (...args) => mockBcryptCompare(...args) },
}));
vi.mock('../../../lib/rateLimit', () => ({
    checkRateLimit: (...args) => mockCheckRateLimit(...args),
    getClientIp: () => '1.2.3.4',
}));

const { authOptions } = await import('../../../pages/api/auth/[...nextauth]');
const authorize = authOptions.providers[0].options.authorize;

const fakeReq = { headers: {} };

beforeEach(() => {
    mockFindUnique.mockReset();
    mockBcryptCompare.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe('authorize() (login)', () => {
    it('returns null without a lookup when credentials are missing', async () => {
        expect(await authorize({}, fakeReq)).toBeNull();
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('returns null (not a thrown error) when the per-IP limit is hit, before any DB lookup', async () => {
        mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });

        const result = await authorize({ email: 'john@example.com', password: 'pw' }, fakeReq);

        expect(result).toBeNull();
        expect(mockFindUnique).not.toHaveBeenCalled();
        expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('returns null when the per-email limit is hit', async () => {
        mockCheckRateLimit
            .mockResolvedValueOnce({ allowed: true }) // IP check passes
            .mockResolvedValueOnce({ allowed: false }); // email check fails

        const result = await authorize({ email: 'john@example.com', password: 'pw' }, fakeReq);

        expect(result).toBeNull();
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('still authenticates normally once both rate-limit checks pass', async () => {
        mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'john@example.com', passwordHash: 'hash' });
        mockBcryptCompare.mockResolvedValue(true);

        const result = await authorize({ email: 'John@Example.com', password: 'correct-password' }, fakeReq);

        expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'john@example.com' } });
        expect(result).toEqual({ id: 'user-1', email: 'john@example.com' });
    });

    it('returns null for a wrong password after passing rate limits', async () => {
        mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'john@example.com', passwordHash: 'hash' });
        mockBcryptCompare.mockResolvedValue(false);

        const result = await authorize({ email: 'john@example.com', password: 'wrong' }, fakeReq);

        expect(result).toBeNull();
    });
});
