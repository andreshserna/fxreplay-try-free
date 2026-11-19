/**
 * Where validated events go. One interface, so the collector and the server-side
 * emitter do not know which vendor is behind it, or whether there is one at all.
 */
import type { EventContext, EventName } from '../../lib/analytics/registry';

export interface AnalyticsEvent {
  name: EventName;
  properties: Record<string, string | number | boolean>;
  context: EventContext;
}

export interface EventSink {
  send(events: AnalyticsEvent[]): Promise<void>;
}

/** No analytics key configured: events are validated upstream and then dropped. */
export const discardSink: EventSink = { send: () => Promise.resolve() };

/** Keeps events in memory, for tests. */
export class MemorySink implements EventSink {
  readonly events: AnalyticsEvent[] = [];

  send(events: AnalyticsEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
}

/** An event in the shape PostHog's capture API takes. */
export function toPostHog(event: AnalyticsEvent) {
  const { anonymous_id, occurred_at, experiments, ...context } = event.context;
  // One property per experiment, so a chart can be broken down by variant.
  const assignments = Object.fromEntries(
    (experiments ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => pair.split(':'))
      .map(([key, variant]) => [`experiment_${key}`, variant]),
  );
  return {
    event: event.name,
    distinct_id: anonymous_id,
    timestamp: occurred_at,
    properties: {
      ...context,
      ...assignments,
      ...event.properties,
      // Visitors are anonymous: no person profile is built from these events.
      $process_person_profile: false,
    },
  };
}

interface PostHogOptions {
  /** The project token. Public by design: it can only write events. */
  key: string;
  host: string;
  fetch?: typeof fetch;
}

/** Forwards to PostHog's batch endpoint (posthog.com/docs/api/capture). */
export class PostHogSink implements EventSink {
  readonly #options: PostHogOptions;

  constructor(options: PostHogOptions) {
    this.#options = options;
  }

  async send(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    const send = this.#options.fetch ?? fetch;
    const response = await send(`${this.#options.host.replace(/\/$/, '')}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.#options.key, batch: events.map(toPostHog) }),
      // A destination that hangs is an error with a log line, not work cut off in silence.
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`PostHog answered ${response.status}`);
  }
}
