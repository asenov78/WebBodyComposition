import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WeightChart from './weightChart';

const render = (props) => renderToStaticMarkup(createElement(WeightChart, props));
const point = (iso, weight) => ({ sourceDate: `${iso}T12:00:00.000Z`, weight });

// ~346 days, like the real dashboard history that prompted the year-aware axis labels.
const longSeries = [
    point('2025-11-18', 55), point('2026-03-01', 52), point('2026-07-01', 49), point('2026-10-28', 50.2),
];

describe('WeightChart', () => {
    it('shows no period picker unless asked (the login page demo chart has none)', () => {
        const html = render({ series: longSeries });
        expect(html).not.toContain('Chart period');
        expect(html).not.toContain('>3M<');
    });

    it('shows every period button when the picker is on, defaulting to All', () => {
        const html = render({ series: longSeries, showRangeSelector: true });
        for (const label of ['1W', '1M', '2M', '3M', '6M', '1Y', '2Y', '3Y', 'All']) {
            expect(html).toContain(`>${label}</button>`);
        }
        // only "All" is the pressed one on first render
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
        expect(html).toMatch(/is-selected[^>]*aria-pressed="true"[^>]*>All</);
    });

    it('labels a near-year span with the year so the two ends cannot be confused', () => {
        const html = render({ series: longSeries });
        expect(html).toContain('Nov 2025');
        expect(html).toContain('Oct 2026');
    });

    it('draws a dot for every point on a short series but only the latest on a long one', () => {
        const few = render({ series: longSeries });
        expect(few.match(/<circle/g)).toHaveLength(4);

        const many = Array.from({ length: 200 }, (_, i) => point(
            new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10), 50 + (i % 7) / 10,
        ));
        expect(render({ series: many }).match(/<circle/g)).toHaveLength(1);
    });

    it('explains an empty chart instead of drawing nothing', () => {
        expect(render({ series: [] })).toContain('need at least 2 points');
        expect(render({ series: [point('2026-10-28', 50)] })).toContain('need at least 2 points');
    });
});
