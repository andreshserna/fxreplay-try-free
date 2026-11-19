/**
 * Every way the Users API can refuse a request. One registry: the server builds its
 * RFC 9457 responses from it, the form switches on its codes, and /problems/ documents it.
 * The contract is docs/api.md.
 */
export const PROBLEMS = {
  invalid_json: {
    status: 400,
    title: 'The body is not valid JSON',
    when: 'The request body cannot be parsed as JSON.',
  },
  idempotency_key_missing: {
    status: 400,
    title: 'A valid Idempotency-Key header is required',
    when: 'A signup has no Idempotency-Key header, or the key is not 16 to 64 characters of A-Z, a-z, 0-9, _ and -.',
  },
  unauthenticated: {
    status: 401,
    title: 'Authentication is required',
    when: 'A profile update has no session cookie or one that is expired or tampered with, or a list request has a missing or wrong admin token.',
  },
  forbidden: {
    status: 403,
    title: 'This request is not allowed to change that user',
    when: "A profile update uses a session that belongs to another user, or its Origin is missing or is not the site's. The event collector also refuses a request from another origin with it.",
  },
  not_found: {
    status: 404,
    title: 'No such user',
    when: "A profile update carries a valid session, but the session's own user no longer exists.",
  },
  method_not_allowed: {
    status: 405,
    title: 'Method not allowed',
    when: 'A users path is called with a method it does not support. The Allow header lists the ones it does.',
  },
  email_taken: {
    status: 409,
    title: 'That email already has an account',
    when: 'A signup uses an email that already has an account.',
  },
  payload_too_large: {
    status: 413,
    title: 'The body is too large',
    when: 'The body is over 8 KB, or over 16 KB for the event collector.',
  },
  unsupported_media_type: {
    status: 415,
    title: 'The body must be application/json',
    when: 'A signup or a profile update is sent without Content-Type: application/json.',
  },
  validation_failed: {
    status: 422,
    title: 'The request has invalid fields',
    when: 'A field, a query parameter or the shape of the body is invalid. When fields are at fault, errors lists each one.',
  },
  idempotency_key_reused: {
    status: 422,
    title: 'That Idempotency-Key was already used with a different body',
    when: 'A signup reuses an Idempotency-Key that was used in the last 24 hours with a different body.',
  },
  rate_limited: {
    status: 429,
    title: 'Too many requests',
    when: 'One client address or one session sent too many requests. Retry-After says how many seconds to wait.',
  },
  internal_error: {
    status: 500,
    title: 'Something went wrong on our side',
    when: 'Something unexpected failed on the server. A signup is safe to retry with the same Idempotency-Key.',
  },
  service_unavailable: {
    status: 503,
    title: 'The service is temporarily unavailable',
    when: 'The database cannot be reached. Retry-After says when to try again, with the same Idempotency-Key for a signup.',
  },
} as const satisfies Record<string, { status: number; title: string; when: string }>;

export type ProblemCode = keyof typeof PROBLEMS;

export interface FieldError {
  /** Dotted path of the field, for example `email` or `attribution.first_touch.at`. */
  field: string;
  /** Stable machine code, for example `required` or `invalid_format`. */
  code: string;
  /** For people. May change. */
  message: string;
}

/** The body of every error response (application/problem+json). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  instance?: string;
  errors?: FieldError[];
}

export const isProblemCode = (value: unknown): value is ProblemCode =>
  typeof value === 'string' && Object.hasOwn(PROBLEMS, value);

/** The problem's identity as a URI: the page that documents it. */
export const problemType = (origin: string, code: ProblemCode): string =>
  `${origin}/problems/${code.replaceAll('_', '-')}`;
