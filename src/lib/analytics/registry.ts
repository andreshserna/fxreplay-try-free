/**
 * The single source of truth for what this site measures (ADR 0007, ADR 0013).
 *
 * Types, runtime validation and the table in docs/analytics-plan.md all derive from
 * this file. It imports nothing, so the docs generator can load it directly.
 *
 * There is no free-text type on purpose. A value is an enum member, a number, a
 * boolean, or one of three narrow string shapes, none of which can hold an email
 * address or anything else a visitor typed.
 */

/** An opaque identifier we generated: a UUID, a ULID, a release SHA. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** A campaign label after normalization: a lowercase slug. It cannot contain "@". */
export const LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** A path on this site, without query string or fragment. */
export const PATH_PATTERN = /^\/[A-Za-z0-9/_-]{0,127}$/;
/** Experiment assignments as `key:variant` pairs joined by commas. */
export const ASSIGNMENTS_PATTERN =
  /^[a-z0-9_]{1,40}:[a-z0-9_]{1,40}(?:,[a-z0-9_]{1,40}:[a-z0-9_]{1,40}){0,9}$/;

interface Described {
  /** One line for the docs table. */
  description: string;
  optional?: true;
}

export type PropertySpec =
  | (Described & { type: 'enum'; values: readonly string[] })
  | (Described & { type: 'integer'; min: number; max: number })
  | (Described & { type: 'number'; min: number; max: number })
  | (Described & { type: 'boolean' })
  | (Described & { type: 'id' | 'label' | 'path' | 'timestamp' | 'assignments' });

export interface EventDefinition {
  /** Where the event is emitted. The collector refuses server events sent by a browser. */
  source: 'client' | 'server';
  /** Precise enough that two people would instrument it identically. */
  trigger: string;
  /** The decision this event informs. An event with none is removed. */
  decision: string;
  properties: Record<string, PropertySpec>;
}

const FORM_LOCATIONS = ['hero', 'closing'] as const;

export const EVENTS = {
  landing_viewed: {
    source: 'client',
    trigger: 'Once per page load, after the landing page has rendered in a browser.',
    decision: 'The denominator of the funnel: whether traffic from a source is worth buying.',
    properties: {},
  },
  cta_clicked: {
    source: 'client',
    trigger: 'A visitor activates a call to action that leads to the signup form.',
    decision: 'Which calls to action earn their place on the page.',
    properties: {
      cta_name: {
        type: 'enum',
        values: ['start_free'],
        description: 'The offer the button makes. One today.',
      },
      cta_location: {
        type: 'enum',
        values: ['hero', 'plan'],
        description: 'The section the button sits in.',
      },
    },
  },
  replay_demo_used: {
    source: 'client',
    trigger:
      "The visitor's first use of the hero illustration's controls or a tap on its chart, once per page load.",
    decision:
      'Whether the interactive illustration earns its place: do visitors who play it sign up more than those who do not.',
    properties: {
      control: {
        type: 'enum',
        values: ['play', 'step', 'speed'],
        description: 'The control used first. A tap on the chart counts as play.',
      },
    },
  },
  signup_started: {
    source: 'client',
    trigger: 'The first input into the email field, once per page load.',
    decision: 'Whether visitors are lost before the form (interest) or in it (friction).',
    properties: {
      form_location: {
        type: 'enum',
        values: FORM_LOCATIONS,
        description: 'Which instance of the form.',
      },
    },
  },
  signup_submitted: {
    source: 'client',
    trigger: 'The form passes client validation and a create request is sent.',
    decision: 'How many attempts never become accounts.',
    properties: {
      form_location: {
        type: 'enum',
        values: FORM_LOCATIONS,
        description: 'Which instance of the form.',
      },
      attempt: {
        type: 'integer',
        min: 1,
        max: 50,
        description: 'Submissions so far in this page load, counting this one.',
      },
    },
  },
  signup_failed: {
    source: 'client',
    trigger: 'A submission ends in anything other than an account, including client validation.',
    decision: 'Which failure to fix first, and whether a release broke the signup.',
    properties: {
      form_location: {
        type: 'enum',
        values: FORM_LOCATIONS,
        description: 'Which instance of the form.',
      },
      attempt: {
        type: 'integer',
        min: 1,
        max: 50,
        description: 'Submissions so far in this page load, counting this one.',
      },
      reason: {
        type: 'enum',
        values: [
          'invalid_email',
          'email_taken',
          'rate_limited',
          'offline',
          'timeout',
          'network',
          'server',
        ],
        description: 'The state the form showed. Never the text the visitor typed.',
      },
    },
  },
  signup_completed: {
    source: 'server',
    trigger: 'The user row has been committed. Not emitted for an idempotent replay.',
    decision: 'The primary conversion. The numerator of the signup conversion rate.',
    properties: {
      user_id: { type: 'id', description: 'The new user, to reconcile against the database.' },
    },
  },
  profile_completed: {
    source: 'server',
    trigger: 'A profile update that leaves at least one answer has been saved.',
    decision: 'Signup quality: the guardrail that stops a variant winning with empty accounts.',
    properties: {
      user_id: { type: 'id', description: 'The user who answered.' },
      markets_count: {
        type: 'integer',
        min: 0,
        max: 5,
        description: 'How many markets were chosen.',
      },
      experience: {
        type: 'enum',
        values: ['beginner', 'intermediate', 'advanced'],
        optional: true,
        description: 'The experience level chosen, if any.',
      },
      goal: {
        type: 'enum',
        values: ['strategy_testing', 'prop_firm', 'practice'],
        optional: true,
        description: 'The goal chosen, if any.',
      },
    },
  },
  experiment_exposed: {
    source: 'server',
    trigger: 'The edge serves a variant of the page to a visitor, before the HTML is sent.',
    decision: 'The denominator of each arm, and the sample-ratio check that validates a run.',
    properties: {
      experiment: { type: 'id', description: 'The experiment key.' },
      variant: { type: 'id', description: 'The variant served.' },
    },
  },
  web_vitals: {
    source: 'client',
    trigger: 'A Core Web Vital is final for this page load: once per metric.',
    decision: 'Whether real visitors get the page the lab budgets promise, by device and variant.',
    properties: {
      metric: {
        type: 'enum',
        values: ['LCP', 'INP', 'CLS'],
        description: 'The metric.',
      },
      value: {
        type: 'number',
        min: 0,
        max: 600000,
        description: 'Milliseconds for LCP and INP. Unitless for CLS.',
      },
      rating: {
        type: 'enum',
        values: ['good', 'needs-improvement', 'poor'],
        description: "The metric's rating at the standard thresholds.",
      },
    },
  },
} as const satisfies Record<string, EventDefinition>;

/**
 * What every event carries besides its own properties. The tracker and the collector
 * attach these. Call sites never pass them.
 */
export const CONTEXT = {
  event_id: { type: 'id', description: 'Unique per event, for deduplication.' },
  occurred_at: { type: 'timestamp', description: 'When it happened, ISO 8601 in UTC.' },
  anonymous_id: {
    type: 'id',
    description: 'The visitor: a first-party cookie set at the edge.',
  },
  session_id: {
    type: 'id',
    optional: true,
    description: 'The visit: ends after 30 minutes without activity. Browser events only.',
  },
  page_path: { type: 'path', optional: true, description: 'The page, without query string.' },
  device_class: {
    type: 'enum',
    values: ['mobile', 'tablet', 'desktop'],
    optional: true,
    description: 'From the viewport width at page load.',
  },
  release: { type: 'id', description: 'The git SHA of the build that emitted it.' },
  experiments: {
    type: 'assignments',
    optional: true,
    description: 'The variant of every running experiment, as `key:variant` pairs.',
  },
  first_source: { type: 'label', optional: true, description: 'First touch: utm_source.' },
  first_medium: { type: 'label', optional: true, description: 'First touch: utm_medium.' },
  first_campaign: { type: 'label', optional: true, description: 'First touch: utm_campaign.' },
  last_source: { type: 'label', optional: true, description: 'Last touch: utm_source.' },
  last_medium: { type: 'label', optional: true, description: 'Last touch: utm_medium.' },
  last_campaign: { type: 'label', optional: true, description: 'Last touch: utm_campaign.' },
  via: { type: 'label', optional: true, description: 'The affiliate token, from ?via=.' },
  aff: { type: 'label', optional: true, description: 'The source tag, from ?aff=.' },
  source: {
    type: 'enum',
    values: ['client', 'server'],
    optional: true,
    description: 'Where the event was emitted. Set by the server, never by the browser.',
  },
  country: {
    type: 'label',
    optional: true,
    description: 'Two-letter country of the request, from the edge. Set by the server.',
  },
  is_bot: {
    type: 'boolean',
    optional: true,
    description: 'The user agent looks automated. Set by the server, to filter in analysis.',
  },
} as const satisfies Record<string, PropertySpec>;

type ValueOf<Spec> = Spec extends { type: 'enum'; values: readonly (infer Value)[] }
  ? Value
  : Spec extends { type: 'integer' | 'number' }
    ? number
    : Spec extends { type: 'boolean' }
      ? boolean
      : string;

type Shape<Specs> = {
  -readonly [Key in keyof Specs as Specs[Key] extends { optional: true } ? never : Key]: ValueOf<
    Specs[Key]
  >;
} & {
  -readonly [Key in keyof Specs as Specs[Key] extends { optional: true } ? Key : never]?: ValueOf<
    Specs[Key]
  >;
};

export type EventName = keyof typeof EVENTS;
export type EventProperties<Name extends EventName> = Shape<(typeof EVENTS)[Name]['properties']>;
export type EventContext = Shape<typeof CONTEXT>;

/** Events a browser may send. `track()` accepts only these. */
export type ClientEventName = {
  [Name in EventName]: (typeof EVENTS)[Name]['source'] extends 'client' ? Name : never;
}[EventName];
export type ServerEventName = Exclude<EventName, ClientEventName>;

export const isEventName = (value: unknown): value is EventName =>
  typeof value === 'string' && Object.hasOwn(EVENTS, value);
