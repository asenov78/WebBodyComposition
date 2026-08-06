import { withAuth } from 'next-auth/middleware';

// Everything requires a session except: the auth pages (login/register/forgot-
// password/reset-password), the NextAuth/register/password-reset API routes,
// api/cron (authenticates itself via CRON_SECRET — called by GitHub Actions with no
// session cookie at all, so it must never hit the session gate), and Next.js
// internals/static assets. Unauthenticated users get bounced to our own /login page
// (with callbackUrl back to where they were headed).
//
// `secret` must match pages/api/auth/[...nextauth].js — see the comment there for why
// we pass AUTH_SECRET explicitly instead of relying on next-auth's NEXTAUTH_SECRET default.
export default withAuth({
    secret: process.env.AUTH_SECRET,
    pages: {
        signIn: '/login',
    },
});

export const config = {
    matcher: [
        '/((?!api/auth|api/register|api/cron|login|register|forgot-password|reset-password|_next/static|_next/image|favicon.ico).*)',
    ],
};
