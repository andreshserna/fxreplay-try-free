import { describe, expect, it } from 'vitest';

import {
  failureReason,
  initialState,
  reduce,
  type SignupAction,
  type SignupState,
  type Trouble,
} from '../../src/components/signup/machine';
import type { CreateUserResult } from '../../src/lib/api/client';
import type { User } from '../../src/lib/api/schemas';

const USER: User = {
  id: 'usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE',
  email: 'ada@example.com',
  profile: {},
  created_at: '2026-11-18T23:29:22.000Z',
  updated_at: '2026-11-18T23:29:22.000Z',
};

const run = (actions: SignupAction[], from: SignupState = initialState) =>
  actions.reduce(reduce, from);

const submit = (email: string, newKey: string, error: string | null = null): SignupAction => ({
  type: 'submitted',
  email,
  newKey,
  error,
});

const typed = (email: string): SignupAction => ({ type: 'typed', email });

describe('the signup flow', () => {
  it('goes from typing to an account, then to the optional profile', () => {
    const state = run([
      typed('ada@example.com'),
      submit('ada@example.com', 'key-1'),
      { type: 'answered', result: { kind: 'created', user: USER } },
    ]);
    expect(state).toEqual({ step: 'profile', user: USER, saving: false, trouble: null });
  });

  it('does not complain about an empty field on blur, but does about a bad one', () => {
    expect(run([{ type: 'blurred', error: 'Enter your email.' }])).toEqual(initialState);
    const state = run([
      typed('ada@'),
      { type: 'blurred', error: 'Enter an email like name@example.com.' },
    ]);
    expect(state).toMatchObject({
      step: 'editing',
      trouble: { kind: 'invalid', message: 'Enter an email like name@example.com.' },
    });
  });

  it('shows a client validation error on submit without sending anything', () => {
    const state = run([
      typed('ada@'),
      submit('ada@', 'key-1', 'Enter an email like name@example.com.'),
    ]);
    expect(state).toMatchObject({ step: 'editing', attempts: 1, attempt: null });
    expect(state.step === 'editing' && state.trouble?.kind).toBe('invalid');
  });

  it('clears a complaint about the email as soon as the visitor types again', () => {
    const invalid = run([typed('ada@'), submit('ada@', 'key-1', 'Bad.'), typed('ada@e')]);
    expect(invalid).toMatchObject({ step: 'editing', trouble: null });

    const taken = run([
      typed('ada@example.com'),
      submit('ada@example.com', 'key-1'),
      { type: 'answered', result: { kind: 'email_taken' } },
      typed('ada+1@example.com'),
    ]);
    expect(taken).toMatchObject({ step: 'editing', trouble: null });
  });

  it('ignores a second submit while the first is in flight', () => {
    const submitting = run([typed('ada@example.com'), submit('ada@example.com', 'key-1')]);
    expect(reduce(submitting, submit('ada@example.com', 'key-2'))).toBe(submitting);
    expect(submitting).toMatchObject({
      step: 'submitting',
      attempt: { key: 'key-1' },
      attempts: 1,
    });
  });

  it.each([
    [{ kind: 'email_taken' }, { kind: 'email_taken' }, 'email_taken'],
    [
      { kind: 'rate_limited', retryAfterSeconds: 30 },
      { kind: 'rate_limited', retryAfterSeconds: 30 },
      'rate_limited',
    ],
    [
      { kind: 'unavailable', reason: 'offline' },
      { kind: 'unavailable', reason: 'offline' },
      'offline',
    ],
    [
      { kind: 'unavailable', reason: 'timeout' },
      { kind: 'unavailable', reason: 'timeout' },
      'timeout',
    ],
    [
      { kind: 'unexpected', status: 418, code: null },
      { kind: 'unavailable', reason: 'server' },
      'server',
    ],
    [
      {
        kind: 'invalid',
        errors: [{ field: 'email', code: 'invalid_format', message: 'From the server.' }],
      },
      { kind: 'invalid', message: 'From the server.' },
      'invalid_email',
    ],
  ] satisfies [CreateUserResult, Trouble, string][])(
    'returns to the form with the input kept when the answer is %o',
    (result, trouble, reason) => {
      const state = run([
        typed('ada@example.com'),
        submit('ada@example.com', 'key-1'),
        { type: 'answered', result },
      ]);
      expect(state).toMatchObject({ step: 'editing', email: 'ada@example.com', trouble });
      expect(state.step === 'editing' && state.trouble && failureReason(state.trouble)).toBe(
        reason,
      );
    },
  );

  it('retries the same email with the same key, and a changed email with a new one', () => {
    const failed = run([
      typed('ada@example.com'),
      submit('ada@example.com', 'key-1'),
      { type: 'answered', result: { kind: 'unavailable', reason: 'timeout' } },
    ]);
    expect(reduce(failed, submit('ada@example.com', 'key-2'))).toMatchObject({
      step: 'submitting',
      attempt: { key: 'key-1', email: 'ada@example.com' },
      attempts: 2,
    });
    expect(
      run([typed('eve@example.com'), submit('eve@example.com', 'key-2')], failed),
    ).toMatchObject({
      step: 'submitting',
      attempt: { key: 'key-2', email: 'eve@example.com' },
    });
  });
});

describe('the profile step', () => {
  const profile: SignupState = { step: 'profile', user: USER, saving: false, trouble: null };

  it('can be skipped: the account already exists', () => {
    expect(reduce(profile, { type: 'profile_skipped' })).toEqual({
      step: 'done',
      user: USER,
      profile: null,
    });
  });

  it('saves the answers and finishes', () => {
    const saved = { ...USER, profile: { markets: ['forex' as const], goal: 'prop_firm' as const } };
    const state = run(
      [
        { type: 'profile_submitted' },
        { type: 'profile_answered', result: { kind: 'updated', user: saved } },
      ],
      profile,
    );
    expect(state).toEqual({ step: 'done', user: saved, profile: saved.profile });
  });

  it('keeps the visitor on the step when saving fails, and never loses the account', () => {
    const unavailable = run(
      [
        { type: 'profile_submitted' },
        { type: 'profile_answered', result: { kind: 'unavailable', reason: 'network' } },
      ],
      profile,
    );
    expect(unavailable).toEqual({ ...profile, trouble: 'unavailable' });

    const expired = run(
      [
        { type: 'profile_submitted' },
        { type: 'profile_answered', result: { kind: 'session_expired' } },
      ],
      profile,
    );
    expect(expired).toEqual({ ...profile, trouble: 'expired' });
  });

  it('ignores a double save and a skip while saving', () => {
    const saving = reduce(profile, { type: 'profile_submitted' });
    expect(reduce(saving, { type: 'profile_submitted' })).toBe(saving);
    expect(reduce(saving, { type: 'profile_skipped' })).toBe(saving);
  });
});
