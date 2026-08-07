import { describe, it, expect } from 'vitest';
import { parseWeightRecords } from './xiaomiWeightParsing';

describe('parseWeightRecords', () => {
    it('passes through an actual array unchanged', () => {
        const records = [{ date: '2026-01-01', weightKg: 80 }];
        expect(parseWeightRecords(records)).toBe(records);
    });

    it('returns [] for a non-array, non-string value', () => {
        expect(parseWeightRecords({ not: 'an array' })).toEqual([]);
        expect(parseWeightRecords(null)).toEqual([]);
        expect(parseWeightRecords(undefined)).toEqual([]);
    });

    it('parses a JSON-encoded array string', () => {
        const json = JSON.stringify([{ date: '2026-01-01', weightKg: 80 }]);
        expect(parseWeightRecords(json)).toEqual([{ date: '2026-01-01', weightKg: 80 }]);
    });

    it('strips a single layer of wrapping quotes before parsing', () => {
        const json = `'${JSON.stringify([{ date: '2026-01-01', weightKg: 80 }])}'`;
        expect(parseWeightRecords(json)).toEqual([{ date: '2026-01-01', weightKg: 80 }]);
    });

    it('returns [] for an empty string', () => {
        expect(parseWeightRecords('')).toEqual([]);
        expect(parseWeightRecords('   ')).toEqual([]);
    });

    it('returns [] for unparseable JSON instead of throwing', () => {
        expect(parseWeightRecords('not valid json{{{')).toEqual([]);
    });

    it('returns [] if the parsed JSON is valid but not an array', () => {
        expect(parseWeightRecords(JSON.stringify({ single: 'object' }))).toEqual([]);
    });
});
