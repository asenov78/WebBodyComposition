// Time ranges for the dashboard weight chart. Pure functions so the boundary rules (month
// arithmetic, "since when") are tested instead of trusted — the component only picks a key.

export const CHART_RANGES = [
    { key: '1w', label: '1W', days: 7 },
    { key: '1m', label: '1M', months: 1 },
    { key: '2m', label: '2M', months: 2 },
    { key: '3m', label: '3M', months: 3 },
    { key: '6m', label: '6M', months: 6 },
    { key: '1y', label: '1Y', months: 12 },
    { key: '2y', label: '2Y', months: 24 },
    { key: '3y', label: '3Y', months: 36 },
    { key: 'all', label: 'All' },
];

// What the chart showed before ranges existed.
export const DEFAULT_RANGE = 'all';

export function isValidRange(key) {
    return CHART_RANGES.some((r) => r.key === key);
}

// `date` minus whole months, clamped to the last day of a shorter month. Plain
// setMonth() turns 31 March - 1 month ("31 February") into 3 March.
function subtractMonths(date, months) {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

// Start of the window, counted back from `now` (today) — not from the newest weigh-in,
// so "1 week" after a quiet fortnight shows an honest gap instead of old data under a
// new label. Null means no lower bound.
export function rangeStart(key, now = new Date()) {
    const range = CHART_RANGES.find((r) => r.key === key);
    if (!range || range.key === 'all') return null;
    if (range.days) return new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    return subtractMonths(now, range.months);
}

export function filterSeriesByRange(series, key, now = new Date()) {
    if (!Array.isArray(series)) return [];
    const start = rangeStart(key, now);
    if (!start) return series.slice();
    return series.filter((m) => new Date(m.sourceDate).getTime() >= start.getTime());
}

const YEAR_AWARE_SPAN_MS = 300 * 24 * 60 * 60 * 1000;

// "28 Oct" inside a year; "Oct 2026" once the span is long enough that the same day/month
// could mean two different years (the old axis read "18 Nov … 28 Oct" for 346 days).
export function formatAxisDate(date, spanMs) {
    if (spanMs > YEAR_AWARE_SPAN_MS) {
        return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(date);
    }
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}
