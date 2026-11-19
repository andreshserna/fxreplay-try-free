/// <reference types="astro/client" />

// Optional configuration. Without a key, events are validated and then discarded,
// so the site runs with no analytics account (ADR 0014).
declare namespace Cloudflare {
  interface Env {
    POSTHOG_KEY?: string;
    POSTHOG_HOST?: string;
  }
}
