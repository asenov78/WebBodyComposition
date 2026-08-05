import { withAuth } from 'next-auth/middleware';

// Everything requires a session except the auth pages themselves, the NextAuth/register
// API routes, and Next.js internals/static assets. Unauthenticated users get bounced to
// our own /login page (with callbackUrl back to where they were headed).
export default withAuth({
    pages: {
        signIn: '/login',
    },
});

export const config = {
    matcher: [
        '/((?!api/auth|api/register|login|register|_next/static|_next/image|favicon.ico).*)',
    ],
};
