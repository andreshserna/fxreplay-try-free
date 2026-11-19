/**
 * The signup form: the one part of the page that hydrates.
 *
 * It renders the state machine (machine.ts) and performs its side effects: the API
 * calls, the analytics events, and moving focus so a keyboard or screen reader user
 * always lands on what changed. The submit button is never disabled: while a request
 * is in flight it says so and ignores a second press.
 */
import { useEffect, useId, useReducer, useRef, type SubmitEvent } from 'react';

import { attribution, track } from '../../lib/analytics/track';
import { apiClient, newIdempotencyKey } from '../../lib/api/client';
import {
  EXPERIENCE_LEVELS,
  GOALS,
  MARKETS,
  parseEmail,
  type ProfilePatch,
} from '../../lib/api/schemas';
import { failureReason, initialState, reduce, type Trouble } from './machine';

interface Props {
  /** Which instance of the form this is, for the analytics events. */
  location: 'hero' | 'closing';
  cta: string;
  layout?: 'row' | 'stack';
  /** Shown under the button, in the slot an error message takes when there is one. */
  promises?: string[];
}

const LABELS: Record<string, string> = {
  forex: 'Forex',
  futures: 'Futures',
  stocks: 'Stocks',
  crypto: 'Crypto',
  indices: 'Indices',
  beginner: 'New to trading',
  intermediate: 'Trading for a while',
  advanced: 'Experienced',
  strategy_testing: 'Test a strategy',
  prop_firm: 'Prepare for a prop firm challenge',
  practice: 'Practise and learn',
};

const LOGIN_URL = 'https://app.fxreplay.com/';

/** Whether the visitor has started typing in a form on this page load: once, for any form. */
let started = false;

/** The first validation message for what was typed, or null when it is a usable email. */
function emailError(value: string): string | null {
  const parsed = parseEmail(value);
  return parsed.ok ? null : (parsed.errors[0]?.message ?? 'Check your email address.');
}

function troubleMessage(trouble: Trouble): string {
  switch (trouble.kind) {
    case 'invalid':
      return trouble.message;
    case 'email_taken':
      return 'This email already has an account.';
    case 'rate_limited':
      return trouble.retryAfterSeconds <= 90
        ? 'Too many attempts. Try again in about a minute.'
        : `Too many attempts. Try again in about ${Math.ceil(trouble.retryAfterSeconds / 60)} minutes.`;
    case 'unavailable':
      return trouble.reason === 'offline'
        ? 'You appear to be offline. Your email is still here: try again when you are back.'
        : 'We could not reach the server. Your email is still here: try again.';
  }
}

export default function SignupForm({ location, cta, layout = 'row', promises = [] }: Props) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const decoy = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const formName = location === 'hero' ? 'Sign up' : 'Sign up, at the end of the page';
  const previous = useRef(state);

  // Side effects of a transition: the request, the analytics events, and focus.
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === state) return;

    if (state.step === 'submitting' && before.step === 'editing') {
      track('signup_submitted', { form_location: location, attempt: state.attempts });
      const { key, email } = state.attempt;
      const given = attribution();
      void apiClient
        .createUser(
          {
            email,
            ...(given.first_touch || given.last_touch ? { attribution: given } : {}),
            ...(decoy.current?.value ? { website: decoy.current.value } : {}),
          },
          { idempotencyKey: key },
        )
        .then((result) => dispatch({ type: 'answered', result }));
    }

    // A failure is a submission that did not produce an account: an answer from the API, or
    // client validation on submit. A complaint shown on blur is not an attempt.
    if (
      state.step === 'editing' &&
      state.trouble &&
      (before.step === 'submitting' ||
        (before.step === 'editing' && state.attempts > before.attempts))
    ) {
      track('signup_failed', {
        form_location: location,
        attempt: state.attempts,
        reason: failureReason(state.trouble),
      });
      input.current?.focus();
    }

    if (state.step !== before.step && (state.step === 'profile' || state.step === 'done')) {
      heading.current?.focus();
    }
  }, [state, location]);

  if (state.step === 'profile' || state.step === 'done') {
    return (
      <div className="signup signup-after">
        <h2 ref={heading} tabIndex={-1} className="signup-title">
          {state.step === 'profile' ? 'Your free account is ready.' : 'You are all set.'}
        </h2>
        {state.step === 'profile' ? (
          <ProfileStep
            saving={state.saving}
            trouble={state.trouble}
            onSkip={() => dispatch({ type: 'profile_skipped' })}
            onSave={(patch) => {
              dispatch({ type: 'profile_submitted' });
              void apiClient
                .updateProfile(state.user.id, patch)
                .then((result) => dispatch({ type: 'profile_answered', result }));
            }}
          />
        ) : (
          <>
            <p className="signup-note">
              This demo ends here. On the real site, your first replay session would open now.
            </p>
            <p>
              <a className="button" href="https://fxreplay.com/">
                See the real FX Replay
              </a>
            </p>
          </>
        )}
      </div>
    );
  }

  const { email } = state;
  const submitting = state.step === 'submitting';
  const trouble = state.step === 'editing' ? state.trouble : null;
  const fieldTrouble = trouble?.kind === 'invalid' || trouble?.kind === 'email_taken';
  const errorId = `${id}-error`;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const parsed = parseEmail(email);
    dispatch({
      type: 'submitted',
      email: parsed.ok ? parsed.data : email,
      error: parsed.ok ? null : (parsed.errors[0]?.message ?? 'Check your email address.'),
      newKey: newIdempotencyKey(),
    });
  }

  return (
    // Before this script runs, the form still works: it posts to /signup as plain HTML.
    <form
      className={`signup signup-${layout}`}
      method="post"
      action="/signup"
      aria-label={formName}
      onSubmit={onSubmit}
      noValidate
    >
      <label htmlFor={id}>Email</label>
      <div className="signup-controls">
        <input
          ref={input}
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          value={state.email}
          aria-invalid={fieldTrouble || undefined}
          aria-describedby={trouble ? errorId : undefined}
          onChange={(event) => {
            if (!started) {
              started = true;
              track('signup_started', { form_location: location });
            }
            dispatch({ type: 'typed', email: event.currentTarget.value });
          }}
          onBlur={() => dispatch({ type: 'blurred', error: emailError(state.email) })}
        />
        <button type="submit" aria-busy={submitting || undefined}>
          {submitting && <span className="signup-spinner" aria-hidden="true" />}
          <span>
            {submitting ? 'Creating…' : trouble?.kind === 'unavailable' ? 'Try again' : cta}
          </span>
        </button>
      </div>
      {/* The button's own label changes, but a button that is not focused is not read out. */}
      <p className="visually-hidden" role="status">
        {submitting ? 'Creating your account…' : ''}
      </p>
      {/* A field people never see or reach. A value in it means a bot filled the form. */}
      <div className="signup-decoy" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Leave this field empty</label>
        <input ref={decoy} id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {/* One slot under the button: the reassurance, or the message when something is wrong.
          Its height is reserved, so neither moves the page. */}
      {!trouble && promises.length > 0 && (
        <ul className="promises">
          {promises.map((promise) => (
            <li key={promise}>{promise}</li>
          ))}
        </ul>
      )}
      <p id={errorId} className="signup-trouble" role="alert">
        {trouble && (
          <>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.75v4h1.5v-4h-1.5Zm0 5.25V13h1.5v-1.5h-1.5Z" />
            </svg>
            <span>
              {troubleMessage(trouble)}{' '}
              {trouble.kind === 'email_taken' && <a href={LOGIN_URL}>Log in on the real site</a>}
            </span>
          </>
        )}
      </p>
    </form>
  );
}

interface ProfileProps {
  saving: boolean;
  trouble: 'unavailable' | 'expired' | null;
  onSave: (patch: ProfilePatch) => void;
  onSkip: () => void;
}

/** Three optional questions, asked only after the account exists. */
function ProfileStep({ saving, trouble, onSave, onSkip }: ProfileProps) {
  const id = useId();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const markets = data.getAll('markets').filter(isOneOf(MARKETS));
    const experience = [data.get('experience')].find(isOneOf(EXPERIENCE_LEVELS));
    const goal = [data.get('goal')].find(isOneOf(GOALS));
    if (markets.length === 0 && !experience && !goal) return onSkip();
    onSave({
      ...(markets.length > 0 ? { markets } : {}),
      ...(experience ? { experience } : {}),
      ...(goal ? { goal } : {}),
    });
  }

  return (
    <form className="signup-profile" onSubmit={onSubmit}>
      <p className="signup-note">
        Three optional questions, so your first session starts closer to how you trade.
      </p>
      <Choices
        legend="What do you trade?"
        name="markets"
        type="checkbox"
        values={MARKETS}
        id={id}
      />
      <Choices
        legend="How long have you traded?"
        name="experience"
        type="radio"
        values={EXPERIENCE_LEVELS}
        id={id}
      />
      <Choices legend="What brings you here?" name="goal" type="radio" values={GOALS} id={id} />
      <p className="signup-trouble" role="alert">
        {trouble === 'unavailable' &&
          'We could not save your answers. Your account is safe: try again.'}
        {trouble === 'expired' && 'This step has expired. Your account is safe: you can skip it.'}
      </p>
      <div className="signup-actions">
        <button type="submit" aria-busy={saving || undefined}>
          {saving && <span className="signup-spinner" aria-hidden="true" />}
          <span>{saving ? 'Saving' : 'Save and continue'}</span>
        </button>
        <button type="button" className="signup-skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </form>
  );
}

const isOneOf =
  <Value extends string>(values: readonly Value[]) =>
  (candidate: unknown): candidate is Value =>
    typeof candidate === 'string' && (values as readonly string[]).includes(candidate);

interface ChoicesProps {
  legend: string;
  name: string;
  type: 'checkbox' | 'radio';
  values: readonly string[];
  id: string;
}

function Choices({ legend, name, type, values, id }: ChoicesProps) {
  return (
    <fieldset className="signup-choices">
      <legend>{legend}</legend>
      <div>
        {values.map((value) => (
          <label key={value} htmlFor={`${id}-${name}-${value}`}>
            <input type={type} id={`${id}-${name}-${value}`} name={name} value={value} />
            <span>{LABELS[value] ?? value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
