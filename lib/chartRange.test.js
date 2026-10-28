import { describe, it, expect } from 'vitest';
import {
    CHART_RANGES, DEFAULT_RANGE, isValidRange, rangeStart, filterSeriesByRange, formatAxisDate,
} from './chartRange';

// Midday UTC so a timezone offset on the machine running the tests can't move a date
// across a day boundary.
const d = (iso) => new Date(`${iso}T12:00:00.000Z`);
const NOW = d('2026-10-28');
const point = (iso, weight = 50) => ({ sourceDate: `${iso}T12:00:00.000Z`, weight });

describe('CHART_RANGES', () => {
    it('offers week, 1/2/3/6 months, 1/2/3 years and everything', () => {
        expect(CHART_RANGES.map((r) => r.key)).toEqual(['1w', '1m', '2m', '3m', '6m', '1y', '2y', '3y', 'all']);
    });

    it('has a short label for every range (they sit side by side on a phone)', () => {
        for (const r of CHART_RANGES) expect(r.label.length).toBeLessThanOrEqual(3);
    });

    it('defaults to all history, which is what the chart showed before ranges existed', () => {
        expect(DEFAULT_RANGE).toBe('all');
    });
});

describe('isValidRange', () => {
    it('accepts known keys and rejects anything else (a stale or tampered stored value)', () => {
        expect(isValidRange('3m')).toBe(true);
        expect(isValidRange('all')).toBe(true);
        expect(isValidRange('5y')).toBe(false);
        expect(isValidRange(undefined)).toBe(false);
        expect(isValidRange(null)).toBe(false);
    });
});

describe('rangeStart', () => {
    it('counts a week back in days', () => {
        expect(rangeStart('1w', NOW).toISOString().slice(0, 10)).toBe('2026-10-21');
    });

    it('counts months and years back from today, not from the latest weigh-in', () => {
        expect(rangeStart('1m', NOW).toISOString().slice(0, 10)).toBe('2026-09-28');
        expect(rangeStart('3m', NOW).toISOString().slice(0, 10)).toBe('2026-07-28');
        expect(rangeStart('6m', NOW).toISOString().slice(0, 10)).toBe('2026-04-28');
        expect(rangeStart('1y', NOW).toISOString().slice(0, 10)).toBe('2025-10-28');
        expect(rangeStart('3y', NOW).toISOString().slice(0, 10)).toBe('2023-10-28');
    });

    it('clamps to the end of a shorter month instead of spilling into the next one', () => {
        // 31 March minus one month is "31 February", which plain Date arithmetic turns into 3 March.
        expect(rangeStart('1m', d('2026-03-31')).toISOString().slice(0, 10)).toBe('2026-02-28');
        expect(rangeStart('1y', d('2024-02-29')).toISOString().slice(0, 10)).toBe('2023-02-28');
    });

    it('has no start for "all" or an unknown key', () => {
        expect(rangeStart('all', NOW)).toBeNull();
        expect(rangeStart('nonsense', NOW)).toBeNull();
    });
});

describe('filterSeriesByRange', () => {
    const series = [
        point('2023-01-01'), point('2025-11-18'), point('2026-04-27'), point('2026-04-28'),
        point('2026-09-27'), point('2026-10-21'), point('2026-10-28'),
    ];

    it('returns everything for "all"', () => {
        expect(filterSeriesByRange(series, 'all', NOW)).toHaveLength(7);
    });

    it('keeps only points on or after the start of the range', () => {
        expect(filterSeriesByRange(series, '1w', NOW).map((p) => p.sourceDate.slice(0, 10)))
            .toEqual(['2026-10-21', '2026-10-28']);
        // exactly on the boundary (28 April) is kept, the day before is not
        expect(filterSeriesByRange(series, '6m', NOW).map((p) => p.sourceDate.slice(0, 10)))
            .toEqual(['2026-04-28', '2026-09-27', '2026-10-21', '2026-10-28']);
        expect(filterSeriesByRange(series, '1y', NOW)).toHaveLength(6);
    });

    it('falls back to everything for an unknown key instead of an empty chart', () => {
        expect(filterSeriesByRange(series, 'nonsense', NOW)).toHaveLength(7);
    });

    it('survives empty and missing input', () => {
        expect(filterSeriesByRange([], '1m', NOW)).toEqual([]);
        expect(filterSeriesByRange(undefined, '1m', NOW)).toEqual([]);
        expect(filterSeriesByRange(null, 'all', NOW)).toEqual([]);
    });

    it('does not mutate or reorder the input', () => {
        const copy = [...series];
        filterSeriesByRange(series, '3m', NOW);
        expect(series).toEqual(copy);
    });
});

describe('formatAxisDate', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('shows day and month for a span inside a year', () => {
        expect(formatAxisDate(d('2026-10-28'), 90 * DAY)).toBe('28 Oct');
    });

    it('adds the year once the span nears a year, so "18 Nov … 28 Oct" is no longer ambiguous', () => {
        expect(formatAxisDate(d('2025-11-18'), 345 * DAY)).toBe('Nov 2025');
        expect(formatAxisDate(d('2026-10-28'), 345 * DAY)).toBe('Oct 2026');
    });
});
