import { describe, it, expect } from 'vitest';
import { computeGarminTimeStamp, extractErrorMessage } from './garminSync';

describe('computeGarminTimeStamp', () => {
    it('returns -1 for no sourceDate (manual/live entry — "use right now")', () => {
        expect(computeGarminTimeStamp(null)).toBe(-1);
        expect(computeGarminTimeStamp(undefined)).toBe(-1);
    });

    it('converts a sourceDate to unix seconds, not milliseconds', () => {
        // Regression test for the bug this session: milliseconds caused the proxy to
        // throw a .NET DateTime overflow ("Value to add was out of range"); seconds is
        // confirmed correct via a real sync landing on the right Garmin Connect date.
        const date = new Date('2025-11-18T13:55:41.000Z');
        const timeStamp = computeGarminTimeStamp(date);
        expect(timeStamp).toBe(1763474141);
        // Sanity: this should be a 10-digit unix-seconds-shaped number, not a
        // 13-digit milliseconds one.
        expect(String(timeStamp).length).toBe(10);
    });

    it('accepts an ISO string the same way it accepts a Date object', () => {
        const iso = '2025-11-18T13:55:41.000Z';
        expect(computeGarminTimeStamp(iso)).toBe(computeGarminTimeStamp(new Date(iso)));
    });

    it('round-trips back to the same date when converted back from seconds', () => {
        const original = new Date('2025-06-15T09:30:00.000Z');
        const timeStamp = computeGarminTimeStamp(original);
        const roundTripped = new Date(timeStamp * 1000);
        expect(roundTripped.toISOString()).toBe(original.toISOString());
    });
});

describe('extractErrorMessage', () => {
    it('uses a bare string response body as-is', () => {
        expect(extractErrorMessage('Garmin Authentication Failed.', 401)).toBe('Garmin Authentication Failed.');
    });

    it('prefers an {error} field when present', () => {
        expect(extractErrorMessage({ error: 'bad credentials' }, 401)).toBe('bad credentials');
    });

    it('stringifies a non-string {error} field', () => {
        expect(extractErrorMessage({ error: { code: 'X' } }, 400)).toBe('{"code":"X"}');
    });

    it('falls back to {message} when there is no {error}', () => {
        expect(extractErrorMessage({ message: 'oops' }, 500)).toBe('oops');
    });

    it('stringifies an unrecognized-shape object rather than discarding it', () => {
        const data = { somethingElse: true };
        expect(extractErrorMessage(data, 500)).toBe(JSON.stringify(data));
    });

    it('gives a specific message for an empty 401 body (the original uninformative-error bug)', () => {
        expect(extractErrorMessage({}, 401)).toBe('Garmin rejected the email/password (401 Unauthorized).');
        expect(extractErrorMessage(null, 401)).toBe('Garmin rejected the email/password (401 Unauthorized).');
    });

    it('falls back to a bare HTTP status for anything else unrecognized', () => {
        expect(extractErrorMessage(null, 500)).toBe('HTTP 500');
        expect(extractErrorMessage('', 502)).toBe('HTTP 502');
    });
});
