/**
 * Wires the server to the Cloudflare runtime. This is the only file that knows about
 * bindings: everything behind it takes plain values and interfaces.
 */
import { env } from 'cloudflare:workers';

import { RELEASE } from '../lib/release';
import { Collector } from './analytics/collector';
import { ServerEvents, type Defer, type Log } from './analytics/emitter';
import { discardSink, PostHogSink, type EventSink } from './analytics/sink';
import { UsersApi } from './users/api';
import { D1UsersRepository } from './users/d1-repository';
import { UsersService } from './users/service';

const log: Log = (message, detail) => console.error(JSON.stringify({ message, ...detail }));

/** With no key the events are still validated, then discarded. */
const sink: EventSink = env.POSTHOG_KEY
  ? new PostHogSink({
      key: env.POSTHOG_KEY,
      host: env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
    })
  : discardSink;

let events: ServerEvents | undefined;
let api: UsersApi | undefined;
let eventCollector: Collector | undefined;

export function serverEvents(): ServerEvents {
  events ??= new ServerEvents({ sink, release: RELEASE, log });
  return events;
}

export function usersApi(): UsersApi {
  api ??= new UsersApi({
    service: new UsersService(new D1UsersRepository(env.DB)),
    events: serverEvents(),
    limiters: {
      create: env.CREATE_LIMITER,
      update: env.UPDATE_LIMITER,
      list: env.LIST_LIMITER,
    },
    sessionSecret: env.SESSION_SECRET,
    adminToken: env.ADMIN_TOKEN,
    log,
  });
  return api;
}

export function collector(): Collector {
  eventCollector ??= new Collector({ sink, limiter: env.EVENTS_LIMITER, log });
  return eventCollector;
}

/** Lets work outlive the response: analytics is sent after the visitor has their answer. */
export const deferOn =
  (locals: App.Locals): Defer =>
  (work) =>
    locals.cfContext.waitUntil(work);
