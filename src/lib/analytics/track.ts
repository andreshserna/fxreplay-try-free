/**
 * The browser tracker (ADR 0014): typed events, batched to the first-party collector.
 *
 * `track()` accepts only browser events from the registry, with their properties, so a
 * typo or a server event is a compile error. Events are stamped, queued and posted to
 * `/api/events` in one batch: two seconds after the first, at ten events, or at once when
 * the page is hidden. The shared context travels once per batch. The visitor id is not
 * in it: the collector reads it from an HttpOnly cookie.
 *
 * Nothing runs at import time, and nothing here throws into the page. Analytics that
 * fail lose events, never the rendering or the signup.
 */
import type { Attribution } from '../api/schemas';
import { RELEASE } from '../release';
import { captureAttribution, toContext } from './attribution';
import {
  ID_PATTERN,
  type ClientEventName,
  type EventContext,
  type EventProperties,
} from './registry';
import { checkProperties } from './validate';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface TrackerDeps {
  page: { url: URL; referrer: string; viewportWidth: number; experiments: string | undefined };
  sessionStorage: StorageLike;
  localStorage: StorageLike;
  send(body: string, urgent: boolean): void;
  now(): Date;
  randomId(): string;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** The adapter for ad platforms: receives the event name and its properties, no ids. */
  dataLayer?: unknown[];
  /** Reports events that fail the registry. Development builds and tests only. */
  debug?: (message: string, detail: unknown) => void;
}

/** An event without properties may omit them. Any other event must pass exactly its own. */
export type TrackArgs<Name extends ClientEventName> = keyof EventProperties<Name> extends never
  ? [properties?: Record<string, never>]
  : [properties: EventProperties<Name>];

export interface Tracker {
  track<Name extends ClientEventName>(name: Name, ...args: TrackArgs<Name>): void;
  flush(urgent?: boolean): void;
  attribution(): Attribution;
}

interface QueuedEvent {
  name: ClientEventName;
  properties: Record<string, unknown>;
  event_id: string;
  occurred_at: string;
}

type SharedContext = Omit<
  EventContext,
  'event_id' | 'occurred_at' | 'anonymous_id' | 'source' | 'country' | 'is_bot'
>;

export const ENDPOINT = '/api/events';
export const SESSION_KEY = 'fxr_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_DELAY_MS = 2000;
const MAX_QUEUE = 10;

const deviceClass = (width: number): NonNullable<SharedContext['device_class']> =>
  width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';

interface Session {
  id: string;
  seen: number;
}

function readSession(storage: StorageLike): Session | undefined {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { id, seen } = parsed as Record<string, unknown>;
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || typeof seen !== 'number') {
      return undefined;
    }
    return { id, seen };
  } catch {
    return undefined;
  }
}

export function createTracker(deps: TrackerDeps): Tracker {
  let queue: QueuedEvent[] = [];
  let timer: unknown;
  let captured: Attribution | undefined;
  let shared: Omit<SharedContext, 'session_id'> | undefined;
  /** The session the queued events belong to. */
  let sessionId: string | undefined;
  /** Used when sessionStorage is blocked or holds something else. */
  let memorySession: Session | undefined;

  function attribution(): Attribution {
    try {
      captured ??= captureAttribution({
        url: deps.page.url,
        referrer: deps.page.referrer,
        now: deps.now(),
        storage: deps.localStorage,
      });
    } catch {
      captured = {};
    }
    return captured;
  }

  /** The context every batch shares, computed once. The session id is added per batch. */
  function buildShared(): void {
    if (shared) return;
    const { url, viewportWidth, experiments } = deps.page;
    shared = {
      page_path: url.pathname,
      device_class: deviceClass(viewportWidth),
      release: RELEASE,
      ...(experiments ? { experiments } : {}),
      ...toContext(attribution()),
    };
  }

  /** The current session id, renewed after 30 minutes without an event. */
  function touchSession(now: number): string {
    const stored = readSession(deps.sessionStorage) ?? memorySession;
    const id = stored && now - stored.seen < SESSION_TIMEOUT_MS ? stored.id : deps.randomId();
    memorySession = { id, seen: now };
    try {
      deps.sessionStorage.setItem(SESSION_KEY, JSON.stringify(memorySession));
    } catch {
      // The in-memory session carries this page load.
    }
    return id;
  }

  function flush(urgent = false): void {
    try {
      if (timer !== undefined) {
        const handle = timer;
        timer = undefined;
        deps.clearTimer(handle);
      }
      if (queue.length === 0 || !shared) return;
      const body = JSON.stringify({ context: { ...shared, session_id: sessionId }, events: queue });
      queue = [];
      deps.send(body, urgent);
    } catch {
      // The batch is lost. The page carries on.
    }
  }

  function track<Name extends ClientEventName>(name: Name, ...args: TrackArgs<Name>): void {
    try {
      const properties: Record<string, unknown> = { ...args[0] };
      const now = deps.now();
      buildShared();
      const session = touchSession(now.getTime());
      // A new session starts a new batch: the queued events belong to the old one.
      if (session !== sessionId) flush();
      sessionId = session;

      queue.push({
        name,
        properties,
        event_id: deps.randomId(),
        occurred_at: now.toISOString(),
      });
      if (queue.length >= MAX_QUEUE) {
        flush();
      } else if (timer === undefined) {
        timer = deps.setTimer(() => {
          timer = undefined;
          flush();
        }, FLUSH_DELAY_MS);
      }

      deps.dataLayer?.push({ event: name, ...properties });
      // Behind DEV as well, so a production build leaves out the validator and the registry.
      if (import.meta.env.DEV && deps.debug) {
        const checked = checkProperties(name, properties);
        if (!checked.ok) deps.debug(`analytics: invalid ${name}`, checked.issues);
      }
    } catch {
      // The event is lost. The page carries on.
    }
  }

  return {
    track,
    flush,
    attribution: () => {
      try {
        return attribution();
      } catch {
        return {};
      }
    },
  };
}

/* The default instance, built from the real browser on first use. */

let instance: Tracker | undefined;

function sendToCollector(body: string, urgent: boolean): void {
  try {
    if (urgent && navigator.sendBeacon(ENDPOINT, body)) return;
  } catch {
    // Fall through to fetch.
  }
  fetch(ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => undefined);
}

/** A UUID where the browser offers one; random hex in an insecure context (a LAN dev URL). */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Storage behind a call, because reading `window.sessionStorage` itself can throw. */
const storageOf = (pick: () => Storage): StorageLike => ({
  getItem: (key) => pick().getItem(key),
  setItem: (key, value) => pick().setItem(key, value),
});

function browserTracker(): Tracker | undefined {
  if (typeof window === 'undefined') return undefined;
  if (instance) return instance;
  const host = window as Window & { dataLayer?: unknown[] };
  const tracker = createTracker({
    page: {
      url: new URL(window.location.href),
      referrer: document.referrer,
      viewportWidth: window.innerWidth,
      experiments: document.documentElement.dataset.experiments,
    },
    sessionStorage: storageOf(() => window.sessionStorage),
    localStorage: storageOf(() => window.localStorage),
    send: sendToCollector,
    now: () => new Date(),
    randomId,
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
    dataLayer: (host.dataLayer ??= []),
    ...(import.meta.env.DEV
      ? { debug: (message: string, detail: unknown) => console.warn(message, detail) }
      : {}),
  });
  instance = tracker;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') tracker.flush(true);
  });
  window.addEventListener('pagehide', () => tracker.flush(true));
  return tracker;
}

/** Records a browser event. A no-op during server rendering. Never throws. */
export function track<Name extends ClientEventName>(name: Name, ...args: TrackArgs<Name>): void {
  try {
    browserTracker()?.track(name, ...args);
  } catch {
    // Analytics never break the page.
  }
}

/** Sends what is queued now. `urgent` uses a beacon, for a page that is going away. */
export function flush(urgent = false): void {
  try {
    browserTracker()?.flush(urgent);
  } catch {
    // Analytics never break the page.
  }
}

/** The visitor's first and last touch, for the create request. Empty during server rendering. */
export function attribution(): Attribution {
  try {
    return browserTracker()?.attribution() ?? {};
  } catch {
    return {};
  }
}
