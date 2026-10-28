import { describe, it, expect } from 'vitest';
import { connectionFromServer, clearXiaomiLocalState, XIAOMI_LOCAL_KEYS } from './xiaomiConnection';

describe('connectionFromServer', () => {
    it('adopts the saved connection when the account has one', () => {
        expect(connectionFromServer({ connected: true, xiaomiUserId: 123, passToken: 'tok', region: 'de', model: 'm1' }))
            .toEqual({ saved: true, userId: '123', passToken: 'tok', region: 'de', model: 'm1' });
    });

    it('wipes the Xiaomi ID and token when the account has no saved connection', () => {
        // Regression: these used to be left as whatever the *browser* had in localStorage,
        // so a new account on a browser that had been used by someone else inherited that
        // person's Xiaomi token and "Get Measurements" imported their weigh-ins into it.
        expect(connectionFromServer({ connected: false }))
            .toEqual({ saved: false, userId: '', passToken: '', region: null, model: null });
    });

    it('treats a missing or malformed response as not connected', () => {
        const none = { saved: false, userId: '', passToken: '', region: null, model: null };
        expect(connectionFromServer(undefined)).toEqual(none);
        expect(connectionFromServer(null)).toEqual(none);
        expect(connectionFromServer({})).toEqual(none);
    });

    it('leaves region/model unset when the server did not send them', () => {
        const result = connectionFromServer({ connected: true, xiaomiUserId: 1, passToken: 't' });
        expect(result.region).toBeNull();
        expect(result.model).toBeNull();
    });
});

describe('clearXiaomiLocalState', () => {
    function fakeStorage(initial) {
        const data = { ...initial };
        return {
            data,
            removeItem: (k) => { delete data[k]; },
        };
    }

    it('removes every Xiaomi key and nothing else', () => {
        const storage = fakeStorage({
            'xiaomiCloud.userId': '1', 'xiaomiCloud.passToken': 't',
            'xiaomiCloud.region': 'de', 'xiaomiCloud.model': 'm', unrelated: 'keep',
        });
        clearXiaomiLocalState(storage);
        expect(storage.data).toEqual({ unrelated: 'keep' });
    });

    it('covers all four keys the connector page writes', () => {
        expect(XIAOMI_LOCAL_KEYS.sort()).toEqual([
            'xiaomiCloud.model', 'xiaomiCloud.passToken', 'xiaomiCloud.region', 'xiaomiCloud.userId',
        ]);
    });

    it('does not throw when storage is unavailable or blocked', () => {
        expect(() => clearXiaomiLocalState(undefined)).not.toThrow();
        expect(() => clearXiaomiLocalState({ removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
    });
});
