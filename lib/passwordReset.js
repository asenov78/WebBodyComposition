import crypto from 'crypto';
import { prisma } from './prisma';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// SHA-256 of the raw token — same principle as a password hash: the raw token that
// actually goes in the email link never touches the database, so a DB leak alone
// can't be used to reset anyone's account.
export function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Generates a fresh reset token for a user and stores its hash. Doesn't invalidate
// older unused tokens for the same user — they just expire naturally, and only one
// can ever be successfully consumed since consumeResetToken marks it used.
export async function createResetToken(userId) {
    const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
        data: { userId, tokenHash: hashToken(rawToken), expiresAt },
    });

    return rawToken;
}

// Looks up a raw token and reports whether it's usable right now, without consuming
// it — lets the reset-password page validate the link before the user submits a
// new password (so "this link expired" shows up before they type anything).
export async function findValidResetToken(rawToken) {
    if (!rawToken) return null;

    const record = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
        return null;
    }

    return record;
}

// Marks a token used. Called only after the new password has actually been saved —
// one successful reset per token, ever.
export async function consumeResetToken(tokenId) {
    await prisma.passwordResetToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
    });
}
