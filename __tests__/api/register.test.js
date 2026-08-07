import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockBcryptHash = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('../../lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: (...args) => mockFindUnique(...args),
            create: (...args) => mockCreate(...args),
        },
    },
}));
vi.mock('bcryptjs', () => ({
    default: { hash: (...args) => mockBcryptHash(...args) },
}));
vi.mock('../../lib/rateLimit', () => ({
    checkRateLimit: (...args) => mockCheckRateLimit(...args),
    getClientIp: () => '1.2.3.4',
}));

const { default: handler } = await import('../../pages/api/register');

function mockReqRes({ method = 'POST', body = {} } = {}) {
    const req = { method, body, headers: {} };
    const res = {
        statusCode: null,
        jsonBody: null,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.jsonBody = body; return this; },
    };
    return { req, res };
}

beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
    mockBcryptHash.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe('POST /api/register', () => {
    it('rejects non-POST methods', async () => {
        const { req, res } = mockReqRes({ method: 'GET' });
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects with 429 when the per-IP limit is hit, before validating anything else', async () => {
        mockCheckRateLimit.mockResolvedValue({ allowed: false });

        const { req, res } = mockReqRes({ body: { email: 'john@example.com', password: 'longenough1' } });
        await handler(req, res);

        expect(res.statusCode).toBe(429);
        expect(mockFindUnique).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('requires email and password', async () => {
        const { req, res } = mockReqRes({ body: {} });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('rejects a short password', async () => {
        const { req, res } = mockReqRes({ body: { email: 'john@example.com', password: 'short' } });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('rejects a duplicate email', async () => {
        mockFindUnique.mockResolvedValue({ id: 'existing-user' });

        const { req, res } = mockReqRes({ body: { email: 'john@example.com', password: 'longenough1' } });
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('creates the user with a normalized email and hashed password on success', async () => {
        mockFindUnique.mockResolvedValue(null);
        mockBcryptHash.mockResolvedValue('$2b$12$hashedvalue');
        mockCreate.mockResolvedValue({ id: 'user-1', email: 'john@example.com' });

        const { req, res } = mockReqRes({ body: { email: 'John@Example.com  ', password: 'longenough1' } });
        await handler(req, res);

        expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'john@example.com' } });
        expect(mockBcryptHash).toHaveBeenCalledWith('longenough1', 12);
        expect(mockCreate).toHaveBeenCalledWith({ data: { email: 'john@example.com', passwordHash: '$2b$12$hashedvalue' } });
        expect(res.statusCode).toBe(201);
    });
});
