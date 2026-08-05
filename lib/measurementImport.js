import { prisma } from './prisma';

// Shared by pages/api/measurements/import.js (client-driven) and lib/xiaomiSync.js
// (cron-driven). Body shape matches what Xiaomi Cloud's /weights endpoint returns.
export async function importMeasurementRecords(userId, records) {
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;

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
        imported += 1;
    }

    return { imported, duplicates, skipped, total: records.length };
}

function numOrNull(value) {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}
