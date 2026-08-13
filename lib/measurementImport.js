import { prisma } from './prisma';

// Shared by pages/api/measurements/import.js (client-driven) and lib/xiaomiSync.js
// (cron-driven). Body shape matches what Xiaomi Cloud's /weights endpoint returns.
export async function importMeasurementRecords(userId, records) {
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    // The raw Xiaomi records that actually turned into a new row — lets callers (the
    // Mi Cloud Connector page) show "what's new" instead of re-listing everything the
    // cloud returned, most of which is already in the database from a prior fetch.
    const newRecords = [];

    for (const record of records) {
        const sourceDate = record.date ? new Date(record.date) : null;
        const weight = parseFloat(record.weightKg);

        if (!sourceDate || Number.isNaN(sourceDate.getTime()) || Number.isNaN(weight)) {
            skipped += 1;
            continue;
        }

        const existing = await prisma.measurement.findUnique({
            where: { userId_sourceDate: { userId, sourceDate } },
            select: { id: true },
        });

        if (existing) {
            duplicates += 1;
            continue;
        }

        try {
            await prisma.measurement.create({
                data: {
                    userId,
                    sourceDate,
                    weight,
                    bmi: numOrNull(record.bmi),
                    fat: numOrNull(record.bodyFat),
                    muscleMass: numOrNull(record.muscleMass),
                    waterPercentage: numOrNull(record.bodyWater),
                    boneMass: numOrNull(record.boneMass),
                    visceralFat: numOrNull(record.visceralFat),
                    metabolicAge: numOrNull(record.metabolicAge),
                    bodyType: numOrNull(record.bodyScore),
                },
            });
        } catch (err) {
            // P2002 = unique constraint violation on (userId, sourceDate) — the findUnique
            // check above raced with another concurrent import (cron + manual click, or two
            // overlapping cron triggers) that inserted the same row first. That's a benign
            // duplicate, not a real failure: count it and move on instead of letting the
            // exception kill the whole batch (and, via fetchAndImportXiaomiWeights, the
            // entire cron run for every user after this one).
            if (err?.code === 'P2002') {
                duplicates += 1;
                continue;
            }
            throw err;
        }

        imported += 1;
        newRecords.push(record);
    }

    return { imported, duplicates, skipped, total: records.length, newRecords };
}

function numOrNull(value) {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}
