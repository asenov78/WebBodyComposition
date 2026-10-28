// The Mi Cloud Connector page keeps the Xiaomi ID / token / region / model in the
// browser's localStorage *and* (since the connection became account-wide) on the server.
// localStorage is per browser, not per account — so on a shared browser a new account
// inherited the previous person's Xiaomi token, and "Get Measurements" imported their
// weigh-ins into it (seen 2026-10-28: Ani's new account received 311 of Plamen's records).
// The server is the only source of truth for who owns what; these two helpers enforce it.

export const XIAOMI_LOCAL_KEYS = [
    'xiaomiCloud.userId',
    'xiaomiCloud.passToken',
    'xiaomiCloud.region',
    'xiaomiCloud.model',
];

// What the page should hold, given /api/xiaomi/credentials. No saved connection (or a
// failed/odd response) means *empty*, never "keep whatever the browser had".
export function connectionFromServer(data) {
    if (data?.connected) {
        return {
            saved: true,
            userId: String(data.xiaomiUserId),
            passToken: data.passToken,
            region: data.region || null,
            model: data.model || null,
        };
    }
    return { saved: false, userId: '', passToken: '', region: null, model: null };
}

// Called on sign-out so the next person on this browser starts clean. Storage can be
// absent or blocked (private window, SSR), which must never break signing out.
export function clearXiaomiLocalState(storage = typeof localStorage === 'undefined' ? undefined : localStorage) {
    if (!storage) return;
    for (const key of XIAOMI_LOCAL_KEYS) {
        try {
            storage.removeItem(key);
        } catch {
            // ignore — best effort
        }
    }
}
