/**
 * Field Core Web Vitals, reported as the `web_vitals` event: once per metric, when it is
 * final for the page load. The lab budgets say what the page should do; this says what
 * real visitors get, split by device class and variant.
 */
import { onCLS, onINP, onLCP, type CLSMetric, type INPMetric, type LCPMetric } from 'web-vitals';

import type { EventProperties } from './registry';
import { track } from './track';

type VitalsMetric = Pick<CLSMetric | INPMetric | LCPMetric, 'name' | 'value' | 'rating'>;
type Report = (name: 'web_vitals', properties: EventProperties<'web_vitals'>) => void;

/** LCP and INP in whole milliseconds, CLS to four decimals. */
export function toVitalsEvent(metric: VitalsMetric): EventProperties<'web_vitals'> {
  const value =
    metric.name === 'CLS' ? Math.round(metric.value * 10_000) / 10_000 : Math.round(metric.value);
  return { metric: metric.name, value, rating: metric.rating };
}

export function reportWebVitals(report: Report = track): void {
  try {
    const send = (metric: VitalsMetric) => report('web_vitals', toVitalsEvent(metric));
    onLCP(send);
    onINP(send);
    onCLS(send);
  } catch {
    // A browser without these APIs reports nothing. The page carries on.
  }
}
