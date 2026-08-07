// Pure parsing, no server-only dependencies (no prisma, no fs) — safe to import from
// both the browser (pages/cloud/xiaomiCloud.js) and the server (lib/xiaomiSync.js),
// which is why this isn't just folded into xiaomiSync.js. Was duplicated
// near-identically in both places before this; extracted here as the one copy.
//
// The Xiaomi Cloud proxy's /weights response sometimes comes back as a JSON array
// directly, sometimes as a JSON-encoded string of one (occasionally quote-wrapped) —
// handle both shapes.
export function parseWeightRecords(responseValue) {
    if (typeof responseValue !== 'string') {
        return Array.isArray(responseValue) ? responseValue : [];
    }

    const trimmedValue = responseValue.trim();
    if (!trimmedValue) return [];

    const normalizedValue = trimmedValue.startsWith("'") && trimmedValue.endsWith("'")
        ? trimmedValue.slice(1, -1)
        : trimmedValue;

    try {
        const parsedValue = JSON.parse(normalizedValue);
        return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
        return [];
    }
}
