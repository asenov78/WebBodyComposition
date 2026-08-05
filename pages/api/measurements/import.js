import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { importMeasurementRecords } from '../../../lib/measurementImport';

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

    const { records } = req.body ?? {};
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'records must be a non-empty array.' });
    }

    const result = await importMeasurementRecords(session.user.id, records);
    return res.status(200).json(result);
}
