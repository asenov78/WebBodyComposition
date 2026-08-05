import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock('./prisma', () => ({
    prisma: {
        measurement: {
            findUnique: (...args) => mockFindUnique(...args),
            create: (...args) => mockCreate(...args),
        },
    },
}));

const { importMeasurementRecords } = await import('./measurementImport');

const USER_ID = 'user-1';

beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
});

describe('importMeasurementRecords', () => {
    it('imports a new, valid record', async () => {
        mockFindUnique.mockResolvedValue(null); // no existing row
        mockCreate.mockResolvedValue({ id: 'm1' });

        const result = await importMeasurementRecords(USER_ID, [
            { date: '2025-11-18T13:55:41.000Z', weightKg: 75.5, bmi: 23.8, bodyFat: 20.5 },
        ]);

        expect(result).toEqual({ imported: 1, duplicates: 0, skipped: 0, total: 1 });
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate.mock.calls[0][0].data).toMatchObject({
            userId: USER_ID,
            weight: 75.5,
            bmi: 23.8,
            fat: 20.5,
        });
    });

    it('counts an already-imported record as a duplicate, not a re-import', async () => {
        // Regression test: the original upsert()-based version always claimed
        // "imported" even when the row already existed.
        mockFindUnique.mockResolvedValue({ id: 'existing-row' });

        const result = await importMeasurementRecords(USER_ID, [
            { date: '2025-11-18T13:55:41.000Z', weightKg: 75.5 },
        ]);

        expect(result).toEqual({ imported: 0, duplicates: 1, skipped: 0, total: 1 });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips a record with no date instead of importing it as "today"', async () => {
        const result = await importMeasurementRecords(USER_ID, [
            { weightKg: 75.5 }, // no `date` field at all
        ]);

        expect(result).toEqual({ imported: 0, duplicates: 0, skipped: 1, total: 1 });
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('skips a record with an unparseable date', async () => {
        const result = await importMeasurementRecords(USER_ID, [
            { date: 'not-a-real-date', weightKg: 75.5 },
        ]);
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(0);
    });

    it('skips a record with a non-numeric weight', async () => {
        const result = await importMeasurementRecords(USER_ID, [
            { date: '2025-11-18T13:55:41.000Z', weightKg: 'not-a-number' },
        ]);
        expect(result.skipped).toBe(1);
    });

    it('processes a mixed batch and tallies each outcome independently', async () => {
        mockFindUnique
            .mockResolvedValueOnce(null) // record 1: new
            .mockResolvedValueOnce({ id: 'dup' }); // record 2: duplicate
        mockCreate.mockResolvedValue({ id: 'm1' });

        const result = await importMeasurementRecords(USER_ID, [
            { date: '2025-11-18T13:55:41.000Z', weightKg: 75.5 }, // new
            { date: '2025-11-19T13:55:41.000Z', weightKg: 75.1 }, // duplicate
            { weightKg: 74.9 }, // skipped (no date)
        ]);

        expect(result).toEqual({ imported: 1, duplicates: 1, skipped: 1, total: 3 });
    });

    it('maps null/undefined optional fields to null rather than NaN', async () => {
        mockFindUnique.mockResolvedValue(null);
        mockCreate.mockResolvedValue({ id: 'm1' });

        await importMeasurementRecords(USER_ID, [
            { date: '2025-11-18T13:55:41.000Z', weightKg: 75.5, bmi: undefined, bodyFat: null },
        ]);

        expect(mockCreate.mock.calls[0][0].data.bmi).toBeNull();
        expect(mockCreate.mock.calls[0][0].data.fat).toBeNull();
    });
});
