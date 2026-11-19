/**
 * Runtime validation against the registry. The collector runs it on everything a
 * browser sends, and the tracker runs it in development and in tests.
 *
 * Unknown keys are dropped, never forwarded: that is what keeps a stray value from
 * reaching the analytics vendor. A missing or invalid required value rejects the event.
 */
import {
  CONTEXT,
  EVENTS,
  ID_PATTERN,
  LABEL_PATTERN,
  PATH_PATTERN,
  type EventContext,
  type EventName,
  type EventProperties,
  type PropertySpec,
} from './registry';

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const STRING_SHAPES = {
  id: ID_PATTERN,
  label: LABEL_PATTERN,
  path: PATH_PATTERN,
  timestamp: TIMESTAMP_PATTERN,
} as const;

function conforms(spec: PropertySpec, value: unknown): boolean {
  switch (spec.type) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value);
    case 'integer':
      return Number.isInteger(value) && withinRange(spec, value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && withinRange(spec, value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return typeof value === 'string' && STRING_SHAPES[spec.type].test(value);
  }
}

const withinRange = (spec: { min: number; max: number }, value: unknown): boolean =>
  typeof value === 'number' && value >= spec.min && value <= spec.max;

export type Checked<Value> =
  { ok: true; value: Value; dropped: string[] } | { ok: false; issues: string[] };

function check<Value>(specs: Record<string, PropertySpec>, input: unknown): Checked<Value> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: ['not an object'] };
  }
  const source = input as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  const issues: string[] = [];

  for (const [key, spec] of Object.entries(specs)) {
    const candidate = source[key];
    if (candidate === undefined || candidate === null) {
      if (!spec.optional) issues.push(`${key}: required`);
    } else if (conforms(spec, candidate)) {
      value[key] = candidate;
    } else if (spec.optional) {
      // An optional value that does not fit is left out, and the event survives.
    } else {
      issues.push(`${key}: not a valid ${spec.type}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const dropped = Object.keys(source).filter((key) => !Object.hasOwn(specs, key));
  return { ok: true, value: value as Value, dropped };
}

/** Checks an event's own properties against its definition. */
export function checkProperties<Name extends EventName>(
  name: Name,
  input: unknown,
): Checked<EventProperties<Name>> {
  return check(EVENTS[name].properties, input);
}

/** Checks the context every event carries. */
export function checkContext(input: unknown): Checked<EventContext> {
  return check(CONTEXT, input);
}

/** Turns a campaign parameter into a label, or nothing if it cannot be one. */
export function toLabel(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const label = raw
    .trim()
    .toLowerCase()
    .replace(/[\s+]+/g, '_');
  return LABEL_PATTERN.test(label) ? label : undefined;
}
