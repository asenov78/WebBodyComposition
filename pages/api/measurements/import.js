import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '../../../lib/prisma';

// Body: { records: [ { date, weightKg, bmi, bodyFat, muscleMass, bodyWater, boneMass,
//                       visceralFat, metabolicAge, bodyScore }, ... ] }
// Same shape as the records pages/cloud/xiaomiCloud.js already renders — bulk-saves them
// so they can be synced to Garmin later without re-fetching from Xiaomi Cloud.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    const userId = session.user.id;

    const { records } = req.body ?? {};
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'records must be a non-empty array.' });
    }

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

        // Check first instead of blind upsert() so we can tell the caller "this one
        // was already there" vs "this is new" — upsert's create/update branches both
        // "succeed" from the caller's point of view, which was making the response
        // claim things were imported when they'd actually been seen before.
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

    return res.status(200).json({ imported, duplicates, skipped, total: records.length });
}

function numOrNull(value) {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}
