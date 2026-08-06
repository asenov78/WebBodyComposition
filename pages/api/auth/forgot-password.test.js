import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCreateResetToken = vi.fn();
const mockSendPasswordResetEmail = vi.fn();

vi.mock('../../../lib/prisma', () => ({
    prisma: { user: { findUnique: (...args) => mockFindUnique(...args) } },
}));
vi.mock('../../../lib/passwordReset', () => ({
    createResetToken: (...args) => mockCreateResetToken(...args),
}));
vi.mock('../../../lib/email', () => ({
    sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
}));

const { default: handler } = await import('./forgot-password');

function mockReqRes({ method = 'POST', body = {} } = {}) {
    const req = { method, body, headers: { host: 'web-body-composition-three.vercel.app' } };
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

const GENERIC_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreateResetToken.mockReset();
    mockSendPasswordResetEmail.mockReset();
});

describe('POST /api/auth/forgot-password', () => {
    it('rejects non-POST methods', async () => {
        const { req, res } = mockReqRes({ method: 'GET' });
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('requires an email', async () => {
        const { req, res } = mockReqRes({ body: {} });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('sends a reset email when the account exists', async () => {
        mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'john@example.com' });
        mockCreateResetToken.mockResolvedValue('raw-token-abc');
        mockSendPasswordResetEmail.mockResolvedValue();

        const { req, res } = mockReqRes({ body: { email: 'John@Example.com' } });
        await handler(req, res);

        // Looks up the normalized (lowercased/trimmed) email.
        expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'john@example.com' } });
        expect(mockCreateResetToken).toHaveBeenCalledWith('user-1');
        expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
            'john@example.com',
            expect.stringContaining('raw-token-abc'),
        );
        expect(res.statusCode).toBe(200);
        expect(res.jsonBody.message).toBe(GENERIC_MESSAGE);
    });

    it('returns the same generic message when no account matches (no user enumeration)', async () => {
        mockFindUnique.mockResolvedValue(null);

        const { req, res } = mockReqRes({ body: { email: 'nobody@example.com' } });
        await handler(req, res);

        expect(mockCreateResetToken).not.toHaveBeenCalled();
        expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.jsonBody.message).toBe(GENERIC_MESSAGE);
    });

    it('still returns the generic message if sending the email throws (e.g. SMTP misconfigured)', async () => {
        mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'john@example.com' });
        mockCreateResetToken.mockResolvedValue('raw-token-abc');
        mockSendPasswordResetEmail.mockRejectedValue(new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not configured.'));

        const { req, res } = mockReqRes({ body: { email: 'john@example.com' } });
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.jsonBody.message).toBe(GENERIC_MESSAGE);
    });
});
