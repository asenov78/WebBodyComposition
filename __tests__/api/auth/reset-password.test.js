import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lives outside pages/ on purpose — see forgot-password.test.js in this same
// directory for why.

const mockUpdate = vi.fn();
const mockFindValidResetToken = vi.fn();
const mockConsumeResetToken = vi.fn();
const mockBcryptHash = vi.fn();

vi.mock('../../../lib/prisma', () => ({
    prisma: { user: { update: (...args) => mockUpdate(...args) } },
}));
vi.mock('../../../lib/passwordReset', () => ({
    findValidResetToken: (...args) => mockFindValidResetToken(...args),
    consumeResetToken: (...args) => mockConsumeResetToken(...args),
}));
vi.mock('bcryptjs', () => ({
    default: { hash: (...args) => mockBcryptHash(...args) },
}));

const { default: handler } = await import('../../../pages/api/auth/reset-password');

function mockReqRes({ method = 'POST', body = {} } = {}) {
    const req = { method, body };
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
    mockUpdate.mockReset();
    mockFindValidResetToken.mockReset();
    mockConsumeResetToken.mockReset();
    mockBcryptHash.mockReset();
});

describe('POST /api/auth/reset-password', () => {
    it('rejects non-POST methods', async () => {
        const { req, res } = mockReqRes({ method: 'GET' });
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('requires both token and password', async () => {
        const { req, res } = mockReqRes({ body: { token: 'abc' } });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(mockFindValidResetToken).not.toHaveBeenCalled();
    });

    it('rejects a password shorter than 8 characters', async () => {
        const { req, res } = mockReqRes({ body: { token: 'abc', password: 'short' } });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(mockFindValidResetToken).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
        mockFindValidResetToken.mockResolvedValue(null);

        const { req, res } = mockReqRes({ body: { token: 'bad-token', password: 'longenough1' } });
        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.jsonBody.error).toMatch(/invalid or has expired/);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('updates the password and consumes the token on a valid request', async () => {
        mockFindValidResetToken.mockResolvedValue({ id: 'token-1', userId: 'user-1' });
        mockBcryptHash.mockResolvedValue('$2b$10$hashedvalue');
        mockUpdate.mockResolvedValue({});
        mockConsumeResetToken.mockResolvedValue();

        const { req, res } = mockReqRes({ body: { token: 'good-token', password: 'newpassword1' } });
        await handler(req, res);

        expect(mockBcryptHash).toHaveBeenCalledWith('newpassword1', 10);
        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: { passwordHash: '$2b$10$hashedvalue' },
        });
        // Token is consumed only after the password update succeeds — not before,
        // so a failed update can't leave the account permanently unresettable.
        expect(mockConsumeResetToken).toHaveBeenCalledWith('token-1');
        expect(res.statusCode).toBe(200);
    });
});
