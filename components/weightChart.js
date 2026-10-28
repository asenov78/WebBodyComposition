import { useEffect, useState } from 'react';
import {
    CHART_RANGES, DEFAULT_RANGE, isValidRange, filterSeriesByRange, formatAxisDate,
} from '../lib/chartRange';

const STORAGE_KEY = 'wbc.chartRange';
// Above this many points the per-point dots just smear into a thick line (346 of them over
// the full history); the line alone reads better. The latest point always keeps its dot.
const MAX_POINTS_WITH_DOTS = 60;
const AXIS_TICKS = 5;

// Lightweight inline SVG line chart — no chart library dependency for one graph.
// Renders weight-over-time from the synced measurement history. With
// `showRangeSelector` it adds a 1W…3Y / All period picker (the login page's demo chart
// has no use for one, so it stays off there).
export default function WeightChart({ series, showRangeSelector = false }) {
    const [range, setRange] = useState(DEFAULT_RANGE);

    // A per-viewer convenience only: it can come back empty or throw (private window,
    // blocked storage), so the chart must render fine without it.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (isValidRange(saved)) setRange(saved);
        } catch { /* default range */ }
    }, []);

    const chooseRange = (key) => {
        setRange(key);
        try {
            localStorage.setItem(STORAGE_KEY, key);
        } catch { /* not remembered, still applied */ }
    };

    const visible = filterSeriesByRange(series, showRangeSelector ? range : DEFAULT_RANGE);

    const selector = showRangeSelector && (
        <div className="buttons has-addons are-small mb-3" role="group" aria-label="Chart period">
            {CHART_RANGES.map((r) => (
                <button
                    key={r.key}
                    type="button"
                    className={`button${r.key === range ? ' is-link is-selected' : ''}`}
                    aria-pressed={r.key === range}
                    onClick={() => chooseRange(r.key)}
                >
                    {r.label}
                </button>
            ))}
        </div>
    );

    if (visible.length < 2) {
        const hasHistory = Array.isArray(series) && series.length >= 2;
        return (
            <div>
                {selector}
                <div className="has-text-centered has-text-grey is-size-7 py-6" style={{ border: '1px dashed var(--bulma-border)', borderRadius: '6px' }}>
                    {hasHistory
                        ? 'Fewer than 2 weigh-ins in this period — pick a longer one.'
                        : 'Not enough synced data yet for a trend line (need at least 2 points).'}
                </div>
            </div>
        );
    }

    const width = 600;
    const height = 220;
    const padding = { top: 16, right: 16, bottom: 28, left: 40 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const points = visible.map((m) => ({ date: new Date(m.sourceDate), weight: m.weight }));
    const minDate = points[0].date.getTime();
    const maxDate = points[points.length - 1].date.getTime();
    const dateSpan = Math.max(1, maxDate - minDate);

    const weights = points.map((p) => p.weight);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    // A little vertical breathing room so the line doesn't touch the top/bottom edges.
    const weightPad = Math.max(0.5, (maxWeight - minWeight) * 0.15);
    const yMin = minWeight - weightPad;
    const yMax = maxWeight + weightPad;
    const weightSpan = Math.max(0.1, yMax - yMin);

    const xFor = (date) => padding.left + ((date.getTime() - minDate) / dateSpan) * innerWidth;
    const yFor = (weight) => padding.top + innerHeight - ((weight - yMin) / weightSpan) * innerHeight;

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date).toFixed(1)} ${yFor(p.weight).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(points[points.length - 1].date).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} `
        + `L ${xFor(points[0].date).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.weight - first.weight;
    const gridLines = 4;
    const showDots = points.length <= MAX_POINTS_WITH_DOTS;

    const axisTicks = Array.from({ length: AXIS_TICKS }).map((_, i) => {
        const fraction = i / (AXIS_TICKS - 1);
        const date = new Date(minDate + dateSpan * fraction);
        return {
            x: padding.left + innerWidth * fraction,
            label: formatAxisDate(date, dateSpan),
            anchor: i === 0 ? 'start' : i === AXIS_TICKS - 1 ? 'end' : 'middle',
        };
    });

    // CSS custom properties, not hardcoded hex — Bulma redefines these under
    // prefers-color-scheme: dark, so the chart follows the OS/browser theme
    // instead of staying light-mode colors on a dark page.
    const lineColor = 'var(--bulma-link)';
    const gridColor = 'var(--bulma-border-weak)';
    const axisTextColor = 'var(--bulma-text-weak)';
    const dotRingColor = 'var(--bulma-scheme-main)';
    const deltaColor = delta > 0 ? 'has-text-danger' : delta < 0 ? 'has-text-success' : 'has-text-grey';

    return (
        <div>
            {selector}
            <div className="is-flex is-align-items-baseline is-justify-content-space-between mb-2">
                <div>
                    <span className="title is-4 mb-0">{last.weight.toFixed(1)}</span>
                    <span className="has-text-grey is-size-7 ml-1">kg</span>
                </div>
                <div className={`is-size-7 has-text-weight-semibold ${deltaColor}`}>
                    {delta === 0 ? '—' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} kg`}
                    <span className="has-text-grey-light has-text-weight-normal ml-1">since {formatAxisDate(first.date, dateSpan)}</span>
                </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {Array.from({ length: gridLines + 1 }).map((_, i) => {
                    const y = padding.top + (innerHeight / gridLines) * i;
                    const value = yMax - (weightSpan / gridLines) * i;
                    return (
                        <g key={i}>
                            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={gridColor} strokeWidth="1" />
                            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill={axisTextColor}>{value.toFixed(0)}</text>
                        </g>
                    );
                })}

                <path d={areaPath} fill="url(#weightFill)" stroke="none" />
                <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {points.map((p, i) => {
                    const isLast = i === points.length - 1;
                    if (!showDots && !isLast) return null;
                    return (
                        <circle key={i} cx={xFor(p.date)} cy={yFor(p.weight)} r={isLast ? 4 : 2.5}
                            fill={lineColor} stroke={dotRingColor} strokeWidth={isLast ? 1.5 : 0} />
                    );
                })}

                {axisTicks.map((tick, i) => (
                    <text key={i} x={tick.x} y={height - 8} textAnchor={tick.anchor} fontSize="10" fill={axisTextColor}>{tick.label}</text>
                ))}
            </svg>
        </div>
    );
}
