import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeGarminTimeStamp, extractErrorMessage } from './garminSync';

const mockCount = vi.fn();
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
const mockCredentialFindUnique = vi.fn();
const mockCredentialUpsert = vi.fn();
const mockCredentialUpdate = vi.fn();
const mockAxiosPost = vi.fn();

vi.mock('./prisma', () => ({
    prisma: {
        measurement: {
            count: (...args) => mockCount(...args),
            findMany: (...args) => mockFindMany(...args),
            updateMany: (...args) => mockUpdateMany(...args),
            update: (...args) => mockUpdate(...args),
        },
        garminCredential: {
            findUnique: (...args) => mockCredentialFindUnique(...args),
            upsert: (...args) => mockCredentialUpsert(...args),
            update: (...args) => mockCredentialUpdate(...args),
        },
    },
}));

vi.mock('./encryption', () => ({
    encrypt: (v) => `enc(${v})`,
    decrypt: (v) => v,
}));

vi.mock('axios', () => ({
    default: { post: (...args) => mockAxiosPost(...args) },
}));

const { syncPendingMeasurementsBatch } = await import('./garminSync');

const USER_ID = 'user-1';

beforeEach(() => {
    mockCount.mockReset();
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
    mockUpdate.mockReset();
    mockCredentialFindUnique.mockReset();
    mockCredentialUpsert.mockReset();
    mockCredentialUpdate.mockReset();
    mockAxiosPost.mockReset();
    mockCredentialFindUnique.mockResolvedValue({
        emailEnc: 'a@b.com', passwordEnc: 'pw', accessTokenEnc: null, tokenSecretEnc: null,
    });
    mockCredentialUpsert.mockResolvedValue({});
    mockCredentialUpdate.mockResolvedValue({});
});

describe('syncPendingMeasurementsBatch — claim-before-push race guard', () => {
    it('skips a measurement without pushing to Garmin when another caller already claimed it', async () => {
        // Regression test: two overlapping callers (the cron and a manual "Sync Now"
        // click, or two overlapping cron triggers) both read the same pending row via
        // findMany before either has flipped syncedToGarmin. Without an atomic claim,
        // both would push the same measurement to Garmin — a duplicate weigh-in entry
        // that can't be undone from this app. The claim (updateMany guarded by
        // syncedToGarmin: false) must be the thing that decides who actually pushes.
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([{ id: 'm1', weight: 75, sourceDate: new Date() }]);
        mockUpdateMany.mockResolvedValue({ count: 0 }); // someone else claimed it first

        const result = await syncPendingMeasurementsBatch({ userId: USER_ID, limit: 5 });

        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: 'm1', syncedToGarmin: false },
            data: { syncedToGarmin: true },
        });
        expect(mockAxiosPost).not.toHaveBeenCalled();
        expect(result.synced).toBe(0);
        expect(result.failures).toEqual([]);
    });

    it('pushes to Garmin when the claim succeeds, and clears syncError on success', async () => {
        mockCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        mockFindMany.mockResolvedValue([{ id: 'm1', weight: 75, sourceDate: new Date() }]);
        mockUpdateMany.mockResolvedValue({ count: 1 }); // claim succeeded
        mockAxiosPost.mockResolvedValue({ status: 201, data: { uploadResult: {} } });

        const result = await syncPendingMeasurementsBatch({ userId: USER_ID, limit: 5 });

        expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        expect(result.synced).toBe(1);
        // Already flipped to true by the claim itself — the post-push update should
        // only need to clear syncError, not set syncedToGarmin again.
        expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { syncError: null } });
    });

    it('reverts the claim when the push to Garmin fails, so the row is retried later', async () => {
        mockCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        mockFindMany.mockResolvedValue([{ id: 'm1', weight: 75, sourceDate: new Date() }]);
        mockUpdateMany.mockResolvedValue({ count: 1 });
        mockAxiosPost.mockResolvedValue({ status: 401, data: {} });

        const result = await syncPendingMeasurementsBatch({ userId: USER_ID, limit: 5 });

        expect(result.synced).toBe(0);
        expect(result.stoppedEarly).toBe(true);
        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: 'm1' },
            data: { syncedToGarmin: false, syncError: expect.any(String) },
        });
    });
});

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
