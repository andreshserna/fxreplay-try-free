/**
 * The experiments this site can run, and how a visitor is assigned (ADR 0008).
 *
 * Assignment is a pure function of the visitor's anonymous id and the experiment
 * key. Nothing is stored: the same visitor always lands in the same arm, the edge
 * and the tests compute it the same way, and a second experiment is independent of
 * the first because its key is part of the hash.
 */

export interface ExperimentDefinition {
  /** The first variant is the control. */
  variants: readonly [string, string, ...string[]];
  /** Off: everyone gets the control and no exposure is logged. */
  enabled: boolean;
  /** The pre-registered plan. */
  spec: string;
}

export const EXPERIMENTS = {
  hero_signup: {
    variants: ['cta_button', 'inline_email'],
    enabled: true,
    spec: 'docs/experiments/hero_signup.md',
  },
} as const satisfies Record<string, ExperimentDefinition>;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type VariantOf<Key extends ExperimentKey> = (typeof EXPERIMENTS)[Key]['variants'][number];
export type Assignments = { [Key in ExperimentKey]: VariantOf<Key> };

/** FNV-1a over the text, then a murmur-style finalizer so nearby ids spread evenly. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

/** The variant this visitor gets. Equal shares across the variants. */
export function assign<Key extends ExperimentKey>(key: Key, anonymousId: string): VariantOf<Key> {
  const { variants, enabled } = EXPERIMENTS[key];
  if (!enabled) return variants[0];
  const bucket = hash(`${key}:${anonymousId}`) % variants.length;
  return variants[bucket] ?? variants[0];
}

/** Every experiment's variant for this visitor. */
export function assignAll(anonymousId: string): Assignments {
  const keys = Object.keys(EXPERIMENTS) as ExperimentKey[];
  return Object.fromEntries(keys.map((key) => [key, assign(key, anonymousId)])) as Assignments;
}

export const isVariant = <Key extends ExperimentKey>(
  key: Key,
  value: unknown,
): value is VariantOf<Key> =>
  typeof value === 'string' && (EXPERIMENTS[key].variants as readonly string[]).includes(value);

/** Assignments in the form the analytics context carries: `key:variant,key:variant`. */
export const formatAssignments = (assignments: Partial<Assignments>): string =>
  Object.entries(assignments)
    .map(([key, variant]) => `${key}:${variant}`)
    .join(',');
