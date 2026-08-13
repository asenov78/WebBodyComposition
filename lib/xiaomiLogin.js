// Extracted from pages/cloud/xiaomiCloud.js (architecture review, 2026-08-11) — this was
// the one piece of the QR-login flow with real retry/timeout/abort logic and zero test
// coverage (everything else in that ~690-line file is UI state + JSX). Pulled out so it
// can be tested like the rest of lib/, same reasoning as xiaomiWeightParsing.js.

// AbortController-aware delay — resolves after delayMs, or rejects with an AbortError
// if the signal fires first (mid-wait or already aborted before the call).
export const sleep = (delayMs, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        const abortError = new Error('Login polling cancelled.');
        abortError.name = 'AbortError';
        reject(abortError);
        return;
    }

    const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', handleAbort);
        resolve();
    }, delayMs);

    const handleAbort = () => {
        clearTimeout(timeoutId);
        const abortError = new Error('Login polling cancelled.');
        abortError.name = 'AbortError';
        reject(abortError);
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
});

// The Xiaomi Cloud login proxy's response field names have drifted across versions
// (sessionid vs sessionId, qrCodeBase64 vs qrCode) — normalize once here instead of at
// every call site.
export function normalizeLoginChallenge(loginResponse) {
    return {
        sessionId: loginResponse?.sessionid ?? loginResponse?.sessionId ?? '',
        loginUrl: loginResponse?.loginUrl ?? '',
        qrCodeBase64: loginResponse?.qrCodeBase64 ?? loginResponse?.qrCode ?? '',
        pollingEndpoint: loginResponse?.pollingEndpoint ?? '',
    };
}

// Also used directly by the component to parse the initial POST /login response
// (not just the GET /poll responses below) — same "sometimes a bare string, sometimes
// real JSON" shape from this proxy.
export async function readJsonResponse(response) {
    const responseText = await response.text();

    if (!responseText) {
        return {};
    }

    try {
        return JSON.parse(responseText);
    } catch {
        return responseText;
    }
}

// Polls `endpoint` every 2s (up to 10 attempts) until the login proxy reports a
// non-"pending" status, then returns that final response. Throws (AbortError) if
// `signal` fires, or a plain Error after 10 attempts with no resolution.
export async function pollForPassToken(endpoint, signal) {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        if (signal?.aborted) {
            const abortError = new Error('Login polling cancelled.');
            abortError.name = 'AbortError';
            throw abortError;
        }

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Polling failed with status ${response.status}`);
        }

        const pollResponse = await readJsonResponse(response);
        const pollStatus = pollResponse?.status ?? '';

        if (pollStatus && pollStatus !== 'pending') {
            return pollResponse;
        }

        if (attempt < 10) {
            await sleep(2000, signal);
        }
    }

    throw new Error('Timed out waiting for Xiaomi login to complete.');
}
