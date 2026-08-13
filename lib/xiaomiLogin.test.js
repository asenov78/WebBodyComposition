import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sleep, normalizeLoginChallenge, pollForPassToken } from './xiaomiLogin';

describe('sleep', () => {
    it('resolves after the delay when not aborted', async () => {
        vi.useFakeTimers();
        const promise = sleep(2000);
        vi.advanceTimersByTime(2000);
        await expect(promise).resolves.toBeUndefined();
        vi.useRealTimers();
    });

    it('rejects immediately with an AbortError if already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(sleep(2000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects with an AbortError if aborted mid-wait', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const promise = sleep(2000, controller.signal);
        controller.abort();
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        vi.useRealTimers();
    });
});

describe('normalizeLoginChallenge', () => {
    it('accepts the lowercase "sessionid" field the proxy actually sends', () => {
        const result = normalizeLoginChallenge({ sessionid: 'abc', loginUrl: 'https://x', qrCode: 'base64==', pollingEndpoint: '/poll' });
        expect(result).toEqual({ sessionId: 'abc', loginUrl: 'https://x', qrCodeBase64: 'base64==', pollingEndpoint: '/poll' });
    });

    it('also accepts the camelCase "sessionId"/"qrCodeBase64" variants', () => {
        const result = normalizeLoginChallenge({ sessionId: 'abc', qrCodeBase64: 'xyz==' });
        expect(result.sessionId).toBe('abc');
        expect(result.qrCodeBase64).toBe('xyz==');
    });

    it('defaults every field to an empty string when the response is missing fields', () => {
        expect(normalizeLoginChallenge({})).toEqual({
            sessionId: '', loginUrl: '', qrCodeBase64: '', pollingEndpoint: '',
        });
    });

    it('handles a null/undefined response without throwing', () => {
        expect(normalizeLoginChallenge(null)).toEqual({
            sessionId: '', loginUrl: '', qrCodeBase64: '', pollingEndpoint: '',
        });
        expect(normalizeLoginChallenge(undefined)).toEqual({
            sessionId: '', loginUrl: '', qrCodeBase64: '', pollingEndpoint: '',
        });
    });
});

describe('pollForPassToken', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns immediately once the proxy reports a non-pending status', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ status: 'completed', userId: 42, passToken: 'tok' }),
        });

        const result = await pollForPassToken('https://proxy/poll/abc');
        expect(result).toEqual({ status: 'completed', userId: 42, passToken: 'tok' });
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while status is "pending", then returns the resolving response', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        global.fetch
            .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: 'pending' }) })
            .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: 'pending' }) })
            .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: 'completed', userId: 1 }) });

        const resultPromise = pollForPassToken('https://proxy/poll/abc');
        // Two 2s sleeps happen between the three polls.
        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(2000);
        const result = await resultPromise;

        expect(result).toEqual({ status: 'completed', userId: 1 });
        expect(global.fetch).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
    });

    it('throws after 10 attempts all stuck on "pending"', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        global.fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: 'pending' }) });

        const resultPromise = pollForPassToken('https://proxy/poll/abc');
        const assertion = expect(resultPromise).rejects.toThrow('Timed out waiting for Xiaomi login to complete.');
        await vi.advanceTimersByTimeAsync(2000 * 10);
        await assertion;
        expect(global.fetch).toHaveBeenCalledTimes(10);
        vi.useRealTimers();
    });

    it('throws with the response body on a non-OK HTTP status', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'proxy down' });
        await expect(pollForPassToken('https://proxy/poll/abc')).rejects.toThrow('proxy down');
    });

    it('rejects with an AbortError instead of polling when already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(pollForPassToken('https://proxy/poll/abc', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
