/**
 * The first-party event collector (ADR 0014): POST /api/events.
 *
 * The page's tracker posts batches here instead of loading a vendor script. Every
 * event is checked against the registry before it can leave: an unregistered event
 * is refused, an unregistered property is dropped, and a server-only event (the
 * conversion, the exposure) cannot be forged from a browser. What only the server
 * knows is added here, and the batch is forwarded after the response is sent.
 */
import { EVENTS, isEventName } from '../../lib/analytics/registry';
import { checkContext, checkProperties } from '../../lib/analytics/validate';
import { readBodyText } from '../http/body';
import { clientKey, jsonResponse, problemResponse, requestContext } from '../http/respond';
import {
  clientOf,
  looksAutomated,
  readVisitor,
  requestCountry,
  visitorCookie,
} from '../http/visitor';
import type { Defer, Log } from './emitter';
import type { AnalyticsEvent, EventSink } from './sink';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 25;
/** A browser's clock is trusted within these bounds. Outside them the server's is used. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 5 * 60 * 1000;

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface CollectorOptions {
  sink: EventSink;
  limiter?: RateLimiter;
  now?: () => Date;
  log?: Log;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class Collector {
  readonly #options: CollectorOptions;

  constructor(options: CollectorOptions) {
    this.#options = options;
  }

  async collect(request: Request, defer: Defer): Promise<Response> {
    const context = requestContext(request);
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== context.url.origin) {
      return problemResponse(context, 'forbidden');
    }
    if (this.#options.limiter) {
      const { success } = await this.#options.limiter.limit({ key: clientKey(request) });
      if (!success) return problemResponse(context, 'rate_limited', { 'Retry-After': '60' });
    }

    // The body is read as text whatever its declared type, and must parse as JSON.
    const text = await readBodyText(request, MAX_BODY_BYTES);
    if (!text.ok) return problemResponse(context, 'payload_too_large');
    let body: unknown;
    try {
      body = JSON.parse(text.text);
    } catch {
      return problemResponse(context, 'invalid_json');
    }
    if (!isRecord(body) || !Array.isArray(body.events) || body.events.length > MAX_EVENTS) {
      return problemResponse(
        context,
        'validation_failed',
        {},
        {
          detail: `Send { context, events } with at most ${MAX_EVENTS} events.`,
        },
      );
    }

    const visitor = readVisitor(request);
    const shared = isRecord(body.context) ? body.context : {};
    const now = this.#options.now?.() ?? new Date();
    const serverSide = {
      anonymous_id: visitor.id,
      source: 'client',
      country: requestCountry(request),
      is_bot: looksAutomated(request),
      ...clientOf(request),
    };

    const accepted: AnalyticsEvent[] = [];
    for (const item of body.events as unknown[]) {
      if (!isRecord(item) || !isEventName(item.name)) continue;
      if (EVENTS[item.name].source !== 'client') continue;
      const properties = checkProperties(item.name, item.properties ?? {});
      const eventContext = checkContext({
        ...shared,
        event_id: item.event_id,
        occurred_at: trustedTime(item.occurred_at, now),
        ...serverSide,
      });
      if (!properties.ok || !eventContext.ok) continue;
      accepted.push({ name: item.name, properties: properties.value, context: eventContext.value });
    }

    if (accepted.length > 0) {
      defer(
        this.#options.sink.send(accepted).catch((error: unknown) => {
          this.#options.log?.('events not delivered', {
            request_id: context.requestId,
            count: accepted.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }),
      );
    }
    return jsonResponse(
      context,
      202,
      { accepted: accepted.length, rejected: body.events.length - accepted.length },
      visitor.isNew ? { 'Set-Cookie': visitorCookie(visitor.id) } : {},
    );
  }
}

/** The browser's timestamp if it is plausible, otherwise the server's. */
function trustedTime(value: unknown, now: Date): string {
  const claimed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  const age = now.getTime() - claimed;
  return Number.isFinite(claimed) && age <= MAX_AGE_MS && age >= -MAX_AHEAD_MS
    ? new Date(claimed).toISOString()
    : now.toISOString();
}
