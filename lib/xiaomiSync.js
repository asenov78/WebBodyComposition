import axios from 'axios';
import { prisma } from './prisma';
import { decrypt } from './encryption';
import { importMeasurementRecords } from './measurementImport';
import { parseWeightRecords } from './xiaomiWeightParsing';

const XIAOMI_WEIGHTS_URL = 'https://grzegorz366-20366.wykr.es/weights';

// Server-side counterpart to what pages/cloud/xiaomiCloud.js does in the browser:
// fetch the latest weight records from Xiaomi Cloud using the saved userId/passToken,
// then import whatever's new. Used by the cron job so new weigh-ins get pulled in
// without anyone having to open the app.
export async function fetchAndImportXiaomiWeights(userId) {
    const cred = await prisma.xiaomiCredential.findUnique({ where: { userId } });
    if (!cred) {
        return { skipped: true, reason: 'no Xiaomi Cloud connection saved' };
    }

    const xiaomiUserId = decrypt(cred.xiaomiUserIdEnc);
    const passToken = decrypt(cred.passTokenEnc);

    let response;
    try {
        response = await axios.post(XIAOMI_WEIGHTS_URL, {
            UserId: Number(xiaomiUserId),
            PassToken: passToken,
            Region: cred.region,
            Model: cred.model,
        }, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            validateStatus: () => true,
            timeout: 15000,
        });
    } catch (err) {
        return { skipped: true, reason: `Xiaomi Cloud request failed: ${err?.code || err?.message}` };
    }

    if (response.status !== 200) {
        return { skipped: true, reason: `Xiaomi Cloud returned HTTP ${response.status}`, xiaomiStatus: response.status };
    }

    const records = parseWeightRecords(response.data);
    if (records.length === 0) {
        return { skipped: false, imported: 0, duplicates: 0, skipped_records: 0, total: 0 };
    }

    // newRecords isn't needed here (that's for the interactive page to show "what's
    // new") — drop it so it doesn't bloat the cron job's logged/returned JSON.
    const { newRecords, ...result } = await importMeasurementRecords(userId, records);
    return { skipped: false, ...result };
}
