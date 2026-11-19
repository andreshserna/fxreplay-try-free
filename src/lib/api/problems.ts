/**
 * Every way the Users API can refuse a request. One registry: the server builds its
 * RFC 9457 responses from it, the form switches on its codes, and /problems/ documents it.
 * The contract is docs/api.md.
 */
export const PROBLEMS = {
  invalid_json: { status: 400, title: 'The body is not valid JSON' },
  idempotency_key_missing: { status: 400, title: 'A valid Idempotency-Key header is required' },
  unauthenticated: { status: 401, title: 'Authentication is required' },
  forbidden: { status: 403, title: 'This request is not allowed to change that user' },
  not_found: { status: 404, title: 'No such user' },
  method_not_allowed: { status: 405, title: 'Method not allowed' },
  email_taken: { status: 409, title: 'That email already has an account' },
  payload_too_large: { status: 413, title: 'The body is too large' },
  unsupported_media_type: { status: 415, title: 'The body must be application/json' },
  validation_failed: { status: 422, title: 'The request has invalid fields' },
  idempotency_key_reused: {
    status: 422,
    title: 'That Idempotency-Key was already used with a different body',
  },
  rate_limited: { status: 429, title: 'Too many requests' },
  internal_error: { status: 500, title: 'Something went wrong on our side' },
  service_unavailable: { status: 503, title: 'The service is temporarily unavailable' },
} as const satisfies Record<string, { status: number; title: string }>;

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
