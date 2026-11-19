/**
 * The signup flow as a state machine: every state the form can show, and the only
 * ways to move between them. It is pure, so every transition is tested without a
 * browser, and the component is left with rendering and side effects.
 *
 *   editing ──submit──▶ submitting ──▶ created ──▶ profile ──▶ done
 *      ▲                    │
 *      └────────────────────┘  invalid · email_taken · rate_limited · unavailable
 */
import type { CreateUserResult, UpdateProfileResult } from '../../lib/api/client';
import type { Profile, User } from '../../lib/api/schemas';

/** What went wrong with a submission, in the form's terms. */
export type Trouble =
  | { kind: 'invalid'; message: string }
  | { kind: 'email_taken' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'unavailable'; reason: 'offline' | 'timeout' | 'network' | 'server' };

export type SignupState =
  | {
      step: 'editing';
      email: string;
      trouble: Trouble | null;
      /** The key of the attempt in flight or just failed. Reused when the same email is retried. */
      attempt: { key: string; email: string } | null;
      attempts: number;
    }
  | { step: 'submitting'; email: string; attempt: { key: string; email: string }; attempts: number }
  | { step: 'profile'; user: User; saving: boolean; trouble: 'unavailable' | 'expired' | null }
  | { step: 'done'; user: User; profile: Profile | null };

export type SignupAction =
  | { type: 'typed'; email: string }
  | { type: 'blurred'; error: string | null }
  | { type: 'submitted'; error: string | null; email: string; newKey: string }
  | { type: 'answered'; result: CreateUserResult }
  | { type: 'profile_submitted' }
  | { type: 'profile_answered'; result: UpdateProfileResult }
  | { type: 'profile_skipped' };

export const initialState: SignupState = {
  step: 'editing',
  email: '',
  trouble: null,
  attempt: null,
  attempts: 0,
};

/** The reason code the `signup_failed` event carries for a trouble. */
export const failureReason = (trouble: Trouble) =>
  trouble.kind === 'invalid'
    ? 'invalid_email'
    : trouble.kind === 'unavailable'
      ? trouble.reason
      : trouble.kind;

function troubleFrom(result: Exclude<CreateUserResult, { kind: 'created' }>): Trouble {
  switch (result.kind) {
    case 'invalid':
      return {
        kind: 'invalid',
        message:
          result.errors.find((error) => error.field === 'email')?.message ?? FALLBACK_INVALID,
      };
    case 'email_taken':
      return { kind: 'email_taken' };
    case 'rate_limited':
      return { kind: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds };
    case 'unavailable':
      return { kind: 'unavailable', reason: result.reason };
    default:
      // An answer outside the contract is shown as a server problem. The caller logs it.
      return { kind: 'unavailable', reason: 'server' };
  }
}

const FALLBACK_INVALID = 'Check your email address and try again.';

export function reduce(state: SignupState, action: SignupAction): SignupState {
  switch (state.step) {
    case 'editing':
      switch (action.type) {
        case 'typed':
          // Typing clears a complaint about what was typed before, not a problem with the service.
          return {
            ...state,
            email: action.email,
            trouble:
              state.trouble?.kind === 'invalid' || state.trouble?.kind === 'email_taken'
                ? null
                : state.trouble,
          };
        case 'blurred':
          // Leaving an empty field is not an error: the visitor has not tried yet.
          if (state.email.trim() === '' || state.trouble) return state;
          return action.error
            ? { ...state, trouble: { kind: 'invalid', message: action.error } }
            : state;
        case 'submitted': {
          const attempts = state.attempts + 1;
          if (action.error) {
            return { ...state, attempts, trouble: { kind: 'invalid', message: action.error } };
          }
          // The same email retried after a failure is the same attempt: same key, so the
          // server cannot create a second account or answer "already registered".
          const attempt =
            state.attempt?.email === action.email
              ? state.attempt
              : { key: action.newKey, email: action.email };
          return { step: 'submitting', email: state.email, attempt, attempts };
        }
        default:
          return state;
      }

    case 'submitting':
      if (action.type !== 'answered') return state; // A second submit while one is in flight.
      return action.result.kind === 'created'
        ? { step: 'profile', user: action.result.user, saving: false, trouble: null }
        : {
            step: 'editing',
            email: state.email,
            trouble: troubleFrom(action.result),
            attempt: state.attempt,
            attempts: state.attempts,
          };

    case 'profile':
      switch (action.type) {
        case 'profile_submitted':
          return state.saving ? state : { ...state, saving: true, trouble: null };
        case 'profile_skipped':
          return state.saving ? state : { step: 'done', user: state.user, profile: null };
        case 'profile_answered':
          if (!state.saving) return state;
          if (action.result.kind === 'updated') {
            return { step: 'done', user: action.result.user, profile: action.result.user.profile };
          }
          // The account exists either way. An expired session only costs the optional answers.
          return {
            ...state,
            saving: false,
            trouble:
              action.result.kind === 'session_expired' || action.result.kind === 'not_found'
                ? 'expired'
                : 'unavailable',
          };
        default:
          return state;
      }

    case 'done':
      return state;
  }
}
