import { describe, expect, it } from 'vitest';

import {
  CONTEXT,
  EVENTS,
  ID_PATTERN,
  LABEL_PATTERN,
  PATH_PATTERN,
  type EventProperties,
  type PropertySpec,
} from '../../src/lib/analytics/registry';
import { checkContext, checkProperties, toLabel } from '../../src/lib/analytics/validate';
import { EXPERIMENTS, assign, assignAll } from '../../src/lib/experiments/registry';

const context = {
  event_id: '0b5c1b0e-6a54-4d0f-9d43-2f6f0e7a9c11',
  occurred_at: '2026-11-18T23:29:22.120Z',
  anonymous_id: '7d1f3f5e-0f0a-4c7b-9a57-3b1a8c1e2d44',
  release: 'a1b2c3d',
};

describe('the event registry', () => {
  it('gives every event a name in snake case, a trigger and a decision', () => {
    for (const [name, event] of Object.entries(EVENTS)) {
      expect(name).toMatch(/^[a-z]+(?:_[a-z]+)+$/);
      expect(event.trigger.length).toBeGreaterThan(20);
      expect(event.decision.length).toBeGreaterThan(20);
    }
  });

  it('has no string shape that an email address fits', () => {
    for (const pattern of [ID_PATTERN, LABEL_PATTERN, PATH_PATTERN]) {
      expect(pattern.test('ada@example.com')).toBe(false);
      expect(pattern.test('Ada Lovelace')).toBe(false);
    }
    const types = [...Object.values(EVENTS).map((event) => event.properties), CONTEXT]
      .flatMap((properties) => Object.values<PropertySpec>(properties))
      .map((spec) => spec.type);
    expect(new Set(types)).not.toContain('string');
  });

  it('rejects at compile time a property the registry does not define', () => {
    const valid: EventProperties<'cta_clicked'> = { cta_name: 'start_free', cta_location: 'hero' };
    // @ts-expect-error cta_location must be one of the registered sections
    const wrongValue: EventProperties<'cta_clicked'> = { cta_name: 'start_free', cta_location: 1 };
    // @ts-expect-error attempt is required
    const missing: EventProperties<'signup_submitted'> = { form_location: 'hero' };
    expect([valid, wrongValue, missing]).toHaveLength(3);
  });
});

describe('runtime validation', () => {
  it('accepts a valid event and returns only its registered properties', () => {
    const result = checkProperties('signup_failed', {
      form_location: 'hero',
      attempt: 2,
      reason: 'email_taken',
      email: 'ada@example.com',
    });
    expect(result).toEqual({
      ok: true,
      value: { form_location: 'hero', attempt: 2, reason: 'email_taken' },
    });
  });

  it('rejects a missing, mistyped or out-of-range required property', () => {
    expect(checkProperties('signup_submitted', { form_location: 'hero' }).ok).toBe(false);
    expect(checkProperties('signup_submitted', { form_location: 'hero', attempt: 0 }).ok).toBe(
      false,
    );
    expect(checkProperties('signup_submitted', { form_location: 'hero', attempt: 1.5 }).ok).toBe(
      false,
    );
    expect(checkProperties('cta_clicked', { cta_name: 'start_free', cta_location: 'nav' }).ok).toBe(
      false,
    );
    expect(checkProperties('landing_viewed', 'not an object').ok).toBe(false);
  });

  it('leaves out an optional value that does not fit, and keeps the event', () => {
    const result = checkProperties('profile_completed', {
      user_id: 'usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE',
      markets_count: 2,
      experience: 'guru',
    });
    expect(result.ok && result.value).toEqual({
      user_id: 'usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE',
      markets_count: 2,
    });
  });

  it('checks the context, and drops a campaign value that is not a label', () => {
    const result = checkContext({
      ...context,
      device_class: 'mobile',
      page_path: '/',
      first_source: 'instagram',
      first_campaign: 'ada@example.com',
    });
    expect(result.ok && result.value).toEqual({
      ...context,
      device_class: 'mobile',
      page_path: '/',
      first_source: 'instagram',
    });
    expect(checkContext({ ...context, anonymous_id: 'ada@example.com' }).ok).toBe(false);
    expect(checkContext({ ...context, occurred_at: 'yesterday' }).ok).toBe(false);
  });

  it('normalizes campaign parameters into labels', () => {
    expect(toLabel(' Paid Social ')).toBe('paid_social');
    expect(toLabel('try+free')).toBe('try_free');
    expect(toLabel('ada@example.com')).toBeUndefined();
    expect(toLabel('')).toBeUndefined();
    expect(toLabel(null)).toBeUndefined();
  });
});

describe('experiment assignment', () => {
  const ids = Array.from({ length: 20000 }, (_, index) => `visitor-${index}`);

  it('keeps a visitor in their arm across releases: these ids are pinned', () => {
    // Changing the hash or its input moves every running visitor to a coin flip. If this
    // fails, the experiment's data up to that release is no longer comparable.
    expect(
      [
        'visitor-a',
        'visitor-c',
        '00000000-0000-4000-8000-000000000001',
        '5f1c2a9e-3b7d-4c11-9a52-0d8e6f4b2c10',
      ].map((id) => assign('hero_signup', id)),
    ).toEqual(['cta_button', 'inline_email', 'cta_button', 'inline_email']);
  });

  it('always gives the same visitor the same variant', () => {
    for (const id of ids.slice(0, 200)) {
      expect(assign('hero_signup', id)).toBe(assign('hero_signup', id));
      expect(assignAll(id).hero_signup).toBe(assign('hero_signup', id));
    }
  });

  it('splits visitors evenly enough to pass a sample-ratio check', () => {
    const control = ids.filter((id) => assign('hero_signup', id) === 'cta_button').length;
    // 20,000 fair coin flips land within 9,768 and 10,232 with probability 0.999.
    expect(control).toBeGreaterThan(9768);
    expect(control).toBeLessThan(10232);
  });

  it('only ever returns a registered variant', () => {
    const seen = new Set(ids.slice(0, 500).map((id) => assign('hero_signup', id)));
    expect([...seen].sort()).toEqual([...EXPERIMENTS.hero_signup.variants].sort());
  });

  it('records no arm for an experiment that is switched off, and serves its control', () => {
    const experiment = EXPERIMENTS.hero_signup as { enabled: boolean };
    const enabled = experiment.enabled;
    experiment.enabled = false;
    try {
      expect(assignAll('visitor-a')).not.toHaveProperty('hero_signup');
      expect(assign('hero_signup', 'visitor-a')).toBe('cta_button');
      // Pinned to inline_email while the experiment runs.
      expect(assign('hero_signup', 'visitor-c')).toBe('cta_button');
    } finally {
      experiment.enabled = enabled;
    }
  });
});
