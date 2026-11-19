/**
 * Events the server emits itself: the conversion, the profile, the exposure.
 * They pass the same validation as browser events and leave through the same sink.
 * Emitting never throws: a failed destination must not fail a signup.
 */
import type { EventContext, EventProperties, ServerEventName } from '../../lib/analytics/registry';
import { checkContext, checkProperties } from '../../lib/analytics/validate';
import type { EventSink } from './sink';

/** Runs work after the response has been sent. `waitUntil` in production. */
export type Defer = (work: Promise<unknown>) => void;

export type Log = (message: string, detail: Record<string, unknown>) => void;

/** What the caller knows about the visitor. The emitter adds the rest. */
export type VisitorContext = Pick<EventContext, 'anonymous_id'> &
  Partial<Omit<EventContext, 'event_id' | 'occurred_at' | 'release' | 'source'>>;

interface ServerEventsOptions {
  sink: EventSink;
  release: string;
  now?: () => Date;
  log?: Log;
}

export class ServerEvents {
  readonly #options: ServerEventsOptions;

  constructor(options: ServerEventsOptions) {
    this.#options = options;
  }

  async emit<Name extends ServerEventName>(
    name: Name,
    properties: EventProperties<Name>,
    visitor: VisitorContext,
  ): Promise<void> {
    try {
      const context = checkContext({
        ...visitor,
        event_id: crypto.randomUUID(),
        occurred_at: (this.#options.now?.() ?? new Date()).toISOString(),
        release: this.#options.release,
        source: 'server',
      });
      const checked = checkProperties(name, properties);
      if (!context.ok || !checked.ok) {
        const issues = [context, checked].flatMap((result) => (result.ok ? [] : result.issues));
        this.#options.log?.('server event rejected', { event: name, issues });
        return;
      }
      await this.#options.sink.send([{ name, properties: checked.value, context: context.value }]);
    } catch (error) {
      this.#options.log?.('server event not delivered', {
        event: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
