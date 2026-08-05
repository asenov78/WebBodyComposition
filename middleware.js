import { withAuth } from 'next-auth/middleware';

// Everything requires a session except the auth pages themselves, the NextAuth/register
// API routes, and Next.js internals/static assets. Unauthenticated users get bounced to
// our own /login page (with callbackUrl back to where they were headed).
//
// `secret` must match pages/api/auth/[...nextauth].js — see the comment there for why
// we pass AUTH_SECRET explicitly instead of relying on next-auth's NEXTAUTH_SECRET default.
export default withAuth({
    secret: process.env.AUTH_SECRET,
    pages: {
        signIn: '/login',
    },
    callbacks: {
        // Temporary diagnostics for the "takes several tries to log in" report —
        // logs whether middleware sees a valid token on each protected request.
        // Pull with `vercel logs`. Remove once the cause is confirmed.
        authorized: ({ req, token }) => {
            console.log(JSON.stringify({
                scope: 'middleware.authorized',
                path: req.nextUrl.pathname,
                hasToken: Boolean(token),
                userId: token?.userId ?? null,
            }));
            return Boolean(token);
        },
    },
});

export const config = {
    matcher: [
        '/((?!api/auth|api/register|login|register|_next/static|_next/image|favicon.ico).*)',
    ],
};
