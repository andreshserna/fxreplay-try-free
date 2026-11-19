/**
 * Shared schemas for the Users API. The form validates with them for the visitor's
 * benefit, and the server validates with them as the authority. Contract: docs/api.md.
 */
import * as z from 'zod/mini';

import type { FieldError } from './problems';

export const MARKETS = ['forex', 'futures', 'stocks', 'crypto', 'indices'] as const;
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const GOALS = ['strategy_testing', 'prop_firm', 'practice'] as const;

export const EMAIL_MAX_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EXPERIMENTS = 10;

/** Trimmed and lowercased, then checked for shape only. Deliverability is not checked here. */
export const emailSchema = z
  .string({ error: 'Enter your email.' })
  .check(
    z.trim(),
    z.toLowerCase(),
    z.minLength(1, { error: 'Enter your email.' }),
    z.maxLength(EMAIL_MAX_LENGTH, { error: 'That email is too long.' }),
    z.regex(EMAIL_SHAPE, { error: 'Enter an email like name@example.com.' }),
  );

const label = z.string().check(z.maxLength(200));

/** One visit that brought the person in: UTM values plus the affiliate parameters. */
const touchSchema = z.strictObject({
  source: z.optional(label),
  medium: z.optional(label),
  campaign: z.optional(label),
  content: z.optional(label),
  term: z.optional(label),
  via: z.optional(label),
  aff: z.optional(label),
  landing_path: z.optional(label),
  at: z.optional(z.iso.datetime()),
});

export const attributionSchema = z.strictObject({
  first_touch: z.optional(z.nullable(touchSchema)),
  last_touch: z.optional(z.nullable(touchSchema)),
});

const experimentKey = z.string().check(z.minLength(1), z.maxLength(64));

export const createUserSchema = z.strictObject({
  email: emailSchema,
  anonymous_id: z.optional(z.string().check(z.minLength(1), z.maxLength(64))),
  attribution: z.optional(attributionSchema),
  experiments: z.optional(
    z.record(experimentKey, experimentKey).check(
      z.refine((assignments) => Object.keys(assignments).length <= MAX_EXPERIMENTS, {
        error: 'Too many experiments.',
      }),
    ),
  ),
  /** Honeypot. People never see this field, so a value means a bot. */
  website: z.optional(z.string().check(z.maxLength(200))),
});

/** A partial profile. A field set to null is cleared. */
export const profilePatchSchema = z.strictObject({
  markets: z.optional(z.nullable(z.array(z.enum(MARKETS)).check(z.maxLength(MARKETS.length)))),
  experience: z.optional(z.nullable(z.enum(EXPERIENCE_LEVELS))),
  goal: z.optional(z.nullable(z.enum(GOALS))),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

export interface Profile {
  markets?: (typeof MARKETS)[number][];
  experience?: (typeof EXPERIENCE_LEVELS)[number];
  goal?: (typeof GOALS)[number];
}

/** A user as the API returns it to its owner. */
export interface User {
  id: string;
  email: string;
  profile: Profile;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MESSAGES: Record<string, string> = {
  required: 'This field is required.',
  invalid_type: 'This value has the wrong type.',
  invalid_format: 'This value is not in the expected format.',
  invalid_choice: 'Choose one of the listed options.',
  too_long: 'This value is too long.',
  too_short: 'This value is too short.',
  unknown_field: 'This field is not accepted.',
  invalid: 'This value is not valid.',
};

function fieldCode(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? 'required' : 'invalid_type';
    case 'too_small':
      return issue.origin === 'string' && issue.minimum === 1 ? 'required' : 'too_short';
    case 'too_big':
      return 'too_long';
    case 'invalid_format':
      return 'invalid_format';
    case 'invalid_value':
      return 'invalid_choice';
    default:
      return 'invalid';
  }
}

/** Turns schema issues into the contract's field errors: one per field, the first wins. */
export function toFieldErrors(error: z.core.$ZodError): FieldError[] {
  const errors = new Map<string, FieldError>();
  const add = (field: string, code: string, message?: string) => {
    if (errors.has(field)) return;
    const custom = message && message !== 'Invalid input' ? message : undefined;
    errors.set(field, { field, code, message: custom ?? DEFAULT_MESSAGES[code] ?? code });
  };
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) add([...path, key].join('.'), 'unknown_field');
    } else {
      add(path.join('.') || 'body', fieldCode(issue), issue.message);
    }
  }
  return [...errors.values()];
}

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FieldError[] };

function parse<T>(schema: z.ZodMiniType<T>, input: unknown): Parsed<T> {
  const result = schema.safeParse(input, { reportInput: true });
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: toFieldErrors(result.error) };
}

export const parseCreateUser = (input: unknown): Parsed<CreateUserInput> =>
  parse(createUserSchema, input);
export const parseProfilePatch = (input: unknown): Parsed<ProfilePatch> =>
  parse(profilePatchSchema, input);
export const parseEmail = (input: unknown): Parsed<string> => parse(emailSchema, input);
