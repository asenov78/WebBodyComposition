import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCount = vi.fn();
const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock('./prisma', () => ({
    prisma: {
        rateLimitAttempt: {
            count: (...args) => mockCount(...args),
            create: (...args) => mockCreate(...args),
            deleteMany: (...args) => mockDeleteMany(...args),
        },
    },
}));

const { checkRateLimit, getClientIp } = await import('./rateLimit');

beforeEach(() => {
    mockCount.mockReset();
    mockCreate.mockReset();
    mockDeleteMany.mockReset();
    mockCreate.mockResolvedValue({});
    mockDeleteMany.mockResolvedValue({ count: 0 });
    // Deterministic: never trigger the random prune branch mid-test unless a
    // test explicitly wants to (Math.random mocked there instead).
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

describe('checkRateLimit', () => {
    it('allows the request and records an attempt when under the limit', async () => {
        mockCount.mockResolvedValue(2);

        const result = await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });

        expect(result.allowed).toBe(true);
        expect(mockCreate).toHaveBeenCalledWith({ data: { key: 'login:john@example.com' } });
    });

    it('counts only attempts within the window, using the same key', async () => {
        mockCount.mockResolvedValue(0);
        const before = Date.now();

        await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });

        const args = mockCount.mock.calls[0][0];
        expect(args.where.key).toBe('login:john@example.com');
        const windowStart = args.where.createdAt.gte.getTime();
        expect(windowStart).toBeGreaterThanOrEqual(before - 900000 - 1000);
        expect(windowStart).toBeLessThanOrEqual(before - 900000 + 1000);
    });

    it('rejects once the count reaches maxAttempts, without recording another attempt', async () => {
        mockCount.mockResolvedValue(5);

        const result = await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });

        expect(result.allowed).toBe(false);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects when the count is already over maxAttempts too', async () => {
        mockCount.mockResolvedValue(9);
        const result = await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });
        expect(result.allowed).toBe(false);
    });

    it('keys are independent — a different key has its own count', async () => {
        mockCount.mockResolvedValue(5);
        await checkRateLimit('login:jane@example.com', { maxAttempts: 5, windowMs: 900000 });
        expect(mockCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ key: 'login:jane@example.com' }) }));
    });

    it('occasionally prunes rows older than 24h (low-probability branch)', async () => {
        Math.random.mockReturnValue(0.001); // force the prune branch
        mockCount.mockResolvedValue(0);

        await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });

        expect(mockDeleteMany).toHaveBeenCalledTimes(1);
        const pruneArg = mockDeleteMany.mock.calls[0][0];
        expect(pruneArg.where.createdAt.lt).toBeInstanceOf(Date);
    });

    it('does not prune on the common path', async () => {
        mockCount.mockResolvedValue(0);
        await checkRateLimit('login:john@example.com', { maxAttempts: 5, windowMs: 900000 });
        expect(mockDeleteMany).not.toHaveBeenCalled();
    });
});

describe('getClientIp', () => {
    it('reads the first entry of x-forwarded-for', () => {
        const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } };
        expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('trims whitespace around the first entry', () => {
        const req = { headers: { 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' } };
        expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('falls back to socket.remoteAddress when the header is missing', () => {
        const req = { headers: {}, socket: { remoteAddress: '9.9.9.9' } };
        expect(getClientIp(req)).toBe('9.9.9.9');
    });

    it('falls back to "unknown" when nothing is available', () => {
        const req = { headers: {}, socket: {} };
        expect(getClientIp(req)).toBe('unknown');
    });
});
