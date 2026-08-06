import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useLocalStorageState from 'use-local-storage-state';

const regionOptions = [
    { value: 'cn', label: 'China' },
    { value: 'de', label: 'Europe' },
    { value: 'ru', label: 'Russia' },
    { value: 'sg', label: 'Singapur' },
    { value: 'us', label: 'USA' },
    { value: 'i2', label: 'India' },
];

const modelOptions = [
    { value: 'yunmai.scales.ms104', label: 'S400 - yunmai.scales.ms104' },
    { value: 'yunmai.scales.ms103', label: 'S400 - yunmai.scales.ms103' },
    { value: 'yunmai.scales.ms107', label: 'S400 - yunmai.scales.ms107' },
    { value: 'yunmai.scales.ms106', label: 'S200 - yunmai.scales.ms106' },
    { value: 'xiaomi.scales.ms116', label: 'S800 - xiaomi.scales.ms116' },


];

const defaultModel = modelOptions[0].value;

//const serverUrl = 'https://localhost:7046';
const serverUrl = 'https://grzegorz366-20366.wykr.es';
const weightEndpoint = `${serverUrl}/weights`;
const loginEndpoint = `${serverUrl}/login`;

export default function XiaomiCloud() {
    const [userId, setUserId] = useLocalStorageState('xiaomiCloud.userId', {
        defaultValue: '',
    });
    const [passToken, setPassToken] = useLocalStorageState('xiaomiCloud.passToken', {
        defaultValue: '',
    });
    const [region, setRegion] = useLocalStorageState('xiaomiCloud.region', {
        defaultValue: 'de',
    });
    const [model, setModel] = useLocalStorageState('xiaomiCloud.model', {
        defaultValue: defaultModel,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGettingPassToken, setIsGettingPassToken] = useState(false);
    const [isPollingPassToken, setIsPollingPassToken] = useState(false);
    const [message, setMessage] = useState('');
    const [loginSessionId, setLoginSessionId] = useState('');
    const [loginUrl, setLoginUrl] = useState('');
    const [qrCodeBase64, setQrCodeBase64] = useState('');
    const [pollingEndpoint, setPollingEndpoint] = useState('');
    const [weightRecords, setWeightRecords] = useState([]);
    const [fetchSummary, setFetchSummary] = useState(null);
    const [isLoadingConnection, setIsLoadingConnection] = useState(true);
    const [isSavedServerSide, setIsSavedServerSide] = useState(false);
    // Once connected, the userId/passToken/region/model fields are irrelevant day-to-day
    // (they're saved server-side already) — tucked behind this toggle instead of always
    // taking up the top of the page.
    const [showConnectionDetails, setShowConnectionDetails] = useState(false);
    const loginPollingControllerRef = useRef(null);

    const isGetMeasurementsEnabled = userId.trim() !== '' && passToken.trim() !== '';

    // Load the server-saved connection once on mount so logging in from a different
    // browser/device (or after clearing localStorage) doesn't lose it — previously this
    // only ever lived in this one browser's localStorage.
    useEffect(() => {
        fetch('/api/xiaomi/credentials')
            .then((r) => r.json())
            .then((data) => {
                if (data.connected) {
                    setUserId(String(data.xiaomiUserId));
                    setPassToken(data.passToken);
                    if (data.region) setRegion(data.region);
                    if (data.model) setModel(data.model);
                    setIsSavedServerSide(true);
                }
            })
            .catch(() => { })
            .finally(() => setIsLoadingConnection(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const saveCredentialsToServer = async (xiaomiUserId, token, currentRegion, currentModel) => {
        try {
            const res = await fetch('/api/xiaomi/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xiaomiUserId, passToken: token, region: currentRegion, model: currentModel }),
            });
            setIsSavedServerSide(res.ok);
        } catch {
            setIsSavedServerSide(false);
        }
    };

    const disconnectXiaomi = async () => {
        await fetch('/api/xiaomi/credentials', { method: 'DELETE' });
        setUserId('');
        setPassToken('');
        setIsSavedServerSide(false);
        setShowConnectionDetails(false);
    };

    const sleep = (delayMs, signal) => new Promise((resolve, reject) => {
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

    const clearLoginChallenge = () => {
        setLoginSessionId('');
        setLoginUrl('');
        setQrCodeBase64('');
        setPollingEndpoint('');
    };

    const cancelPassTokenPolling = () => {
        loginPollingControllerRef.current?.abort();
    };

    const readJsonResponse = async (response) => {
        const responseText = await response.text();

        if (!responseText) {
            return {};
        }

        try {
            return JSON.parse(responseText);
        } catch {
            return responseText;
        }
    };

    const parseWeightRecords = (responseValue) => {
        if (typeof responseValue !== 'string') {
            return Array.isArray(responseValue) ? responseValue : [];
        }

        const trimmedValue = responseValue.trim();

        if (!trimmedValue) {
            return [];
        }

        const normalizedValue = trimmedValue.startsWith("'") && trimmedValue.endsWith("'")
            ? trimmedValue.slice(1, -1)
            : trimmedValue;

        try {
            const parsedValue = JSON.parse(normalizedValue);
            return Array.isArray(parsedValue) ? parsedValue : [];
        } catch {
            return [];
        }
    };

    const submitMeasurements = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage('');
        setWeightRecords([]);
        setFetchSummary(null);

        try {
            const response = await fetch(weightEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    UserId: Number(userId),
                    PassToken: passToken,
                    Region: region,
                    Model: model,
                }),
            });
            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(responseText || `Request failed with status ${response.status}`);
            }

            const parsedRecords = parseWeightRecords(responseText);
            const allRecords = parsedRecords
                .slice()
                .sort((left, right) => new Date(right.date) - new Date(left.date));

            if (allRecords.length > 0) {
                const importRes = await fetch('/api/measurements/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ records: allRecords }),
                });
                const importData = await importRes.json();

                if (importRes.ok) {
                    // Show only what's actually new — Xiaomi Cloud always returns the
                    // full history, and re-listing rows already saved from a previous
                    // fetch was just noise.
                    const newRecords = (importData.newRecords || [])
                        .slice()
                        .sort((left, right) => new Date(right.date) - new Date(left.date));
                    setWeightRecords(newRecords);
                    setFetchSummary({ total: allRecords.length, imported: importData.imported, duplicates: importData.duplicates });
                    setMessage('');
                } else {
                    setMessage(`Fetched ${allRecords.length} record${allRecords.length === 1 ? '' : 's'} from Xiaomi Cloud, but saving them failed.`);
                }
            } else {
                setMessage(responseText || 'Measurements request sent successfully.');
            }
        } catch (error) {
            setMessage(error.message || 'Unable to get measurements.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const normalizeLoginChallenge = (loginResponse) => ({
        sessionId: loginResponse?.sessionid ?? loginResponse?.sessionId ?? '',
        loginUrl: loginResponse?.loginUrl ?? '',
        qrCodeBase64: loginResponse?.qrCodeBase64 ?? loginResponse?.qrCode ?? '',
        pollingEndpoint: loginResponse?.pollingEndpoint ?? '',
    });

    const pollForPassToken = async (endpoint, signal) => {
        for (let attempt = 1; attempt <= 10; attempt += 1) {
            if (signal?.aborted) {
                const abortError = new Error('Login polling cancelled.');
                abortError.name = 'AbortError';
                throw abortError;
            }

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
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
    };

    const getPassToken = async () => {
        const controller = new AbortController();

        loginPollingControllerRef.current?.abort();
        loginPollingControllerRef.current = controller;

        setIsGettingPassToken(true);
        setIsPollingPassToken(true);
        setMessage('');
        clearLoginChallenge();

        try {
            const response = await fetch(loginEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    UserId: Number(userId),
                    Region: region,
                    Model: model,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Request failed with status ${response.status}`);
            }

            const loginResponse = normalizeLoginChallenge(await readJsonResponse(response));
            setLoginSessionId(loginResponse.sessionId);
            setLoginUrl(loginResponse.loginUrl);
            setQrCodeBase64(loginResponse.qrCodeBase64);
            setPollingEndpoint(loginResponse.pollingEndpoint);

            const pollResponse = await pollForPassToken(`${serverUrl}${loginResponse.pollingEndpoint}`, controller.signal);

            if (pollResponse?.status === 'completed') {
                // pollResponse.userId is the numeric Xiaomi account id the weights
                // endpoint expects (confirmed live: {"userId":238807326,...}).
                // pollResponse.cUserId is a *different* string identifier the proxy
                // also returns — it is NOT a substitute, so it's intentionally not
                // used here (an earlier version of this fix wrongly preferred it).
                const resolvedUserId = pollResponse.userId ?? pollResponse.UserId
                    ?? pollResponse.userID ?? pollResponse.uid ?? pollResponse.miAccountId
                    ?? pollResponse.accountId;
                const resolvedPassToken = pollResponse.passToken ?? pollResponse.PassToken;

                if (resolvedUserId !== undefined && resolvedUserId !== null && resolvedUserId !== '') {
                    setUserId(String(resolvedUserId));
                }

                if (resolvedPassToken !== undefined && resolvedPassToken !== null) {
                    setPassToken(String(resolvedPassToken));
                }

                if (resolvedUserId && resolvedPassToken) {
                    // Persist to the account, not just this browser, so it's there
                    // next time regardless of device/incognito/logout.
                    await saveCredentialsToServer(String(resolvedUserId), String(resolvedPassToken), region, model);
                }

                if (resolvedUserId === undefined || resolvedUserId === null || resolvedUserId === '') {
                    setMessage(`Pass token retrieved, but no User ID field was found in the response. Raw keys: ${Object.keys(pollResponse).join(', ')}`);
                } else {
                    setMessage('Pass token retrieved successfully.');
                }
            } else {
                setMessage(`Login finished with status: ${pollResponse?.status ?? 'unknown'}`);
            }
        } catch (error) {
            setMessage(error?.name === 'AbortError'
                ? 'Login polling cancelled.'
                : error.message || 'Unable to get pass token.');
        } finally {
            clearLoginChallenge();
            setIsGettingPassToken(false);
            setIsPollingPassToken(false);
            if (loginPollingControllerRef.current === controller) {
                loginPollingControllerRef.current = null;
            }
        }
    };

    const formatDate = (value) => {
        if (!value) {
            return '-';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    };

    const formatValue = (value) => {
        if (value === null || value === undefined || value === '') {
            return '-';
        }

        return typeof value === 'number' ? value.toLocaleString('en-US') : value;
    };

    const metricFields = [
        { key: 'weightKg', label: 'Weight (kg)' },

        { key: 'bmi', label: 'BMI' },
        { key: 'bodyFat', label: 'Body Fat %' },
        { key: 'bodyWater', label: 'Body Water %' },
        { key: 'boneMass', label: 'Bone Mass' },
        { key: 'metabolicAge', label: 'Metabolic Age' },
        { key: 'muscleMass', label: 'Muscle Mass' },
        { key: 'proteinMass', label: 'Protein Mass' },
        { key: 'visceralFat', label: 'Visceral Fat' },
        { key: 'basalMetabolism', label: 'Basal Metabolism' },
        { key: 'bodyScore', label: 'Body Score' },
        { key: 'heartRate', label: 'Heart Rate' },
        { key: 'skeletalMuscleMass', label: 'Skeletal Muscle Mass' },
        { key: 'source', label: 'Source' },
        { key: 'user', label: 'User' },
        { key: 'height', label: 'Height (cm)' },
    ];

    const fieldInputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50';
    const showDetailFields = !isSavedServerSide || showConnectionDetails;

    return (
        <div className='max-w-3xl mx-auto px-4'>
            <div className='text-center mt-6 mb-8'>
                <h1 className='text-3xl font-bold'>Mi Cloud Connector</h1>
                <p className='text-gray-500 mt-1'>S400 scale → Xiaomi Cloud → this app.</p>
            </div>

            {isLoadingConnection && (
                <p className='text-center text-gray-500 mt-4'>Checking saved connection…</p>
            )}

            {/* One form for the whole connect/fetch flow — the "Get Measurements" button
                stays inside it (not a detached form= reference) so it keeps working
                whether or not the detail fields below are expanded. */}
            {!isLoadingConnection && !isPollingPassToken && (
                <form onSubmit={submitMeasurements} className='rounded-2xl border border-gray-200 shadow-sm bg-white p-5 mb-6 space-y-4'>
                    {isSavedServerSide && (
                        <div className='flex items-center justify-between flex-wrap gap-3'>
                            <div>
                                <h2 className='font-semibold text-gray-700'>✅ Connected to Xiaomi Cloud</h2>
                                <p className='text-sm text-gray-500 mt-1'>Account-wide — works from any device, no need to reconnect.</p>
                            </div>
                            <button
                                type='submit'
                                disabled={!isGetMeasurementsEnabled || isSubmitting}
                                className='bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm py-2 px-4 rounded-lg whitespace-nowrap'
                            >
                                {isSubmitting ? 'Checking…' : 'Get Measurements'}
                            </button>
                        </div>
                    )}

                    {isSavedServerSide && (
                        <div className='flex items-center gap-4'>
                            <button
                                type='button'
                                onClick={() => setShowConnectionDetails((v) => !v)}
                                className='text-xs text-gray-400 hover:text-gray-600 underline'
                            >
                                {showConnectionDetails ? 'Hide' : 'Show'} connection details
                            </button>
                            {!showConnectionDetails && (
                                <a href='#' className='text-xs text-gray-400 hover:text-red-500 underline' onClick={(e) => { e.preventDefault(); disconnectXiaomi(); }}>
                                    Disconnect
                                </a>
                            )}
                        </div>
                    )}

                    {showDetailFields && (
                    <div className={`space-y-4 ${isSavedServerSide ? 'pt-4 border-t border-gray-100' : ''}`}>
                    {!isSavedServerSide && (
                        <p className='text-sm text-gray-500 -mt-1'>Connect once — scan the QR code below, and it&apos;s remembered on your account from then on.</p>
                    )}

                    <label className='block'>
                        <span className='text-gray-700 text-sm font-medium'>User ID</span>
                        <input
                            type='number'
                            name='userId'
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            className={fieldInputClass}
                            placeholder='123456789'
                        />
                    </label>

                    <label className='block'>
                        <span className='text-gray-700 text-sm font-medium'>Pass Token</span>
                        <textarea
                            name='passToken'
                            rows={3}
                            value={passToken}
                            onChange={(e) => setPassToken(e.target.value)}
                            className={fieldInputClass}
                            placeholder='Paste pass token here'
                        />
                    </label>

                    <div className='flex items-center gap-3 flex-wrap'>
                        <button
                            type='button'
                            onClick={getPassToken}
                            disabled={isGettingPassToken || isSubmitting}
                            className='bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold text-sm py-2 px-4 rounded-lg'
                        >
                            {isGettingPassToken ? 'Getting pass token...' : 'Get Pass Token (QR login)'}
                        </button>
                        {isSavedServerSide && (
                            <a href='#' className='text-xs text-gray-400 hover:text-red-500 underline' onClick={(e) => { e.preventDefault(); disconnectXiaomi(); }}>
                                Disconnect / use a different account
                            </a>
                        )}
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        <label className='block'>
                            <span className='text-gray-700 text-sm font-medium'>Account region</span>
                            <select
                                name='region'
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                className={fieldInputClass}
                            >
                                {regionOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.value} - {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className='block'>
                            <span className='text-gray-700 text-sm font-medium'>Scale model</span>
                            <select
                                name='model'
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className={fieldInputClass}
                            >
                                {!modelOptions.some((option) => option.value === model) && model && (
                                    <option value={model}>
                                        {model} (saved)
                                    </option>
                                )}
                                {modelOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {!isSavedServerSide && (
                        <div className='pt-2'>
                            <button
                                type='submit'
                                disabled={!isGetMeasurementsEnabled || isSubmitting || isGettingPassToken}
                                className='bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm py-2 px-4 rounded-lg'
                            >
                                {isSubmitting ? 'Getting measurements...' : 'Get Measurements'}
                            </button>
                        </div>
                    )}
                    </div>
                    )}

                    {message && (
                        <div className='text-sm text-gray-700 whitespace-pre-wrap'>
                            {message}
                        </div>
                    )}
                </form>
            )}

            {isPollingPassToken && (
                <div className='rounded-2xl border border-gray-200 shadow-sm bg-white p-5 mb-6 space-y-4'>
                    <div>
                        <h2 className='font-semibold text-gray-700'>Waiting for Xiaomi login</h2>
                        <p className='text-sm text-gray-500 mt-1'>Scan the QR code or open the login link, then wait for polling to finish.</p>
                    </div>

                    {loginSessionId && (
                        <div className='text-xs text-gray-400'>Session ID: {loginSessionId}</div>
                    )}
                    {qrCodeBase64 && (
                        <div className='flex justify-center'>
                            <img
                                src={`data:image/png;base64,${qrCodeBase64}`}
                                alt='Xiaomi login QR code'
                                className='max-w-full rounded-lg border border-gray-200 bg-white p-2'
                            />
                        </div>
                    )}
                    {loginUrl && (
                        <div className='break-all text-center text-sm'>
                            <a
                                href={loginUrl}
                                target='_blank'
                                rel='noreferrer'
                                className='font-semibold text-blue-700 underline'
                            >
                                {loginUrl}
                            </a>
                        </div>
                    )}
                    {pollingEndpoint && (
                        <div className='text-xs text-gray-400'>Polling endpoint: {pollingEndpoint}</div>
                    )}
                    <div className='text-sm text-center text-gray-700 whitespace-pre-wrap'>
                        {message || 'Polling for pass token...'}
                    </div>
                    <div className='text-center'>
                        <button
                            type='button'
                            onClick={cancelPassTokenPolling}
                            className='bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2 px-4 rounded-lg'
                        >
                            Cancel Login
                        </button>
                    </div>
                </div>
            )}

            {fetchSummary && weightRecords.length === 0 && (
                <div className='rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-4 mb-6 text-sm text-emerald-800 text-center'>
                    ✅ You&apos;re all caught up — no new measurements ({fetchSummary.duplicates} of {fetchSummary.total} fetched were already saved).
                </div>
            )}

            {weightRecords.length > 0 && (
                <div className='mb-6'>
                    <h2 className='font-semibold text-gray-700 mb-2'>
                        🎉 {weightRecords.length} new measurement{weightRecords.length === 1 ? '' : 's'}
                        {fetchSummary && (
                            <span className='font-normal text-gray-400 text-sm ml-2'>
                                ({fetchSummary.duplicates} of {fetchSummary.total} fetched were already saved)
                            </span>
                        )}
                    </h2>
                    <div className='overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
                        <div className='overflow-x-auto'>
                            <table className='min-w-full divide-y divide-gray-200 text-sm'>
                                <thead className='bg-gray-50'>
                                    <tr>
                                        <th className='px-4 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap'>Date</th>
                                        {metricFields.map((field) => (
                                            <th key={field.key} className='px-4 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap'>
                                                {field.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-100 bg-white'>
                                    {weightRecords.map((record, index) => (
                                        <tr key={`${record.date || 'record'}-${index}`} className='hover:bg-gray-50'>
                                            <td className='whitespace-nowrap px-4 py-2.5 font-medium text-gray-900'>
                                                {formatDate(record.date)}
                                            </td>
                                            {metricFields.map((field) => (
                                                <td key={field.key} className='whitespace-nowrap px-4 py-2.5 text-gray-700'>
                                                    {formatValue(record[field.key])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <div className='flex flex-wrap items-center gap-3 mb-10'>
                <Link href='/' passHref>
                    <button
                        type='button'
                        className='bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm py-2 px-4 rounded-lg'
                    >
                        &lt; Back
                    </button>
                </Link>

                {fetchSummary && !isPollingPassToken && (
                    <Link href='/sync/garmin-bulk' passHref className='ml-auto'>
                        <button
                            type='button'
                            className='bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm py-2 px-4 rounded-lg'
                        >
                            Continue → Connect to Garmin
                        </button>
                    </Link>
                )}
            </div>
        </div>
    )
}