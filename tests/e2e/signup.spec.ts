import { expect, test, type Route } from '@playwright/test';

import {
  clientAddress,
  expectAccessible,
  flushEvents,
  openAs,
  recordEvents,
  uniqueEmail,
} from './support';

const problem = (status: number, code: string, headers: Record<string, string> = {}) => ({
  status,
  headers: { 'Content-Type': 'application/problem+json; charset=utf-8', ...headers },
  body: JSON.stringify({ type: 'about:blank', title: code, status, code, instance: '/api/users' }),
});

test.describe('the variant: an email field in the hero', () => {
  test('signs up, answers the profile, and sends the funnel exactly once', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'inline_email');
    const email = uniqueEmail();

    const field = page.getByLabel('Email', { exact: true }).first();
    await field.fill(email);
    await page.getByRole('button', { name: 'Start for free' }).first().click();

    const ready = page.getByRole('heading', { name: 'Your free account is ready.' });
    await expect(ready).toBeVisible();
    await expect(ready).toBeFocused();

    await page.getByLabel('Forex').check();
    await page.getByLabel('Prepare for a prop firm challenge').check();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByRole('heading', { name: 'You are all set.' })).toBeFocused();

    await flushEvents(page);
    const names = sent.events.map((event) => event.name).filter((name) => name !== 'web_vitals');
    expect(names).toEqual(['landing_viewed', 'signup_started', 'signup_submitted']);
    expect(sent.events.find((event) => event.name === 'signup_submitted')).toMatchObject({
      properties: { form_location: 'hero', attempt: 1 },
      context: { page_path: '/', experiments: 'hero_signup:inline_email' },
    });
    // No event carries the email, and the browser never sends a visitor id.
    expect(sent.bodies.join()).not.toContain(email);
    expect(sent.bodies.join()).not.toContain('anonymous_id');
  });

  test('validates on blur and on submit, and moves focus to the field', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'inline_email');
    const field = page.getByLabel('Email', { exact: true }).first();

    await field.fill('ada@');
    await field.blur();
    await expect(page.getByRole('alert').first()).toContainText('Enter an email like');
    await expect(field).toHaveAttribute('aria-invalid', 'true');

    await field.fill('ada@e');
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Start for free' }).first().click();
    await expect(page.getByRole('alert').first()).toContainText('Enter an email like');
    await expect(field).toBeFocused();
    await expectAccessible(page);

    await flushEvents(page);
    expect(sent.events.find((event) => event.name === 'signup_failed')?.properties).toEqual({
      form_location: 'hero',
      attempt: 1,
      reason: 'invalid_email',
    });
    expect(sent.events.some((event) => event.name === 'signup_submitted')).toBe(false);
  });

  test('tells a returning visitor the email already has an account, with a way to log in', async ({
    page,
    baseURL,
    request,
  }) => {
    const email = uniqueEmail();
    const first = await request.post('/api/users', {
      headers: { 'Idempotency-Key': crypto.randomUUID(), 'CF-Connecting-IP': clientAddress() },
      data: { email },
    });
    expect(first.status()).toBe(201);

    await openAs(page, baseURL, 'inline_email');
    await page.getByLabel('Email', { exact: true }).first().fill(email);
    await page.getByLabel('Email', { exact: true }).first().press('Enter');

    await expect(page.getByRole('alert').first()).toContainText('already has an account');
    await expect(page.getByRole('link', { name: 'Log in on the real site' })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true }).first()).toHaveValue(email);
  });

  test('says when there were too many attempts', async ({ page, baseURL }) => {
    await page.route('**/api/users', (route) =>
      route.fulfill(problem(429, 'rate_limited', { 'Retry-After': '60' })),
    );
    await openAs(page, baseURL, 'inline_email');
    await page.getByLabel('Email', { exact: true }).first().fill(uniqueEmail());
    await page.getByLabel('Email', { exact: true }).first().press('Enter');
    await expect(page.getByRole('alert').first()).toContainText('Too many attempts');
  });

  test('keeps the email when the server cannot be reached, and retries with the same key', async ({
    page,
    baseURL,
  }) => {
    const keys: string[] = [];
    let healthy = false;
    await page.route('**/api/users', async (route: Route) => {
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      if (healthy) await route.continue();
      else await route.fulfill(problem(503, 'service_unavailable', { 'Retry-After': '5' }));
    });
    await openAs(page, baseURL, 'inline_email');
    const email = uniqueEmail();
    const field = page.getByLabel('Email', { exact: true }).first();
    await field.fill(email);
    await field.press('Enter');

    await expect(page.getByRole('alert').first()).toContainText('could not reach the server');
    await expect(field).toHaveValue(email);
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();

    healthy = true;
    await retry.click();
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();

    // The client retried once on its own, then the visitor retried: one key throughout.
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(new Set(keys).size).toBe(1);
  });

  test('ignores a double submit', async ({ page, baseURL }) => {
    let requests = 0;
    await page.route('**/api/users', async (route: Route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await openAs(page, baseURL, 'inline_email');
    const field = page.getByLabel('Email', { exact: true }).first();
    await field.fill(uniqueEmail());
    await field.press('Enter');
    const busy = page.getByRole('button', { name: 'Creating…' });
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toBeEnabled();
    await busy.click();
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();
    expect(requests).toBe(1);
  });

  test('lets the visitor skip the profile, and is accessible at every step', async ({
    page,
    baseURL,
  }) => {
    await openAs(page, baseURL, 'inline_email');
    await expectAccessible(page);
    await page.getByLabel('Email', { exact: true }).first().fill(uniqueEmail());
    await page.getByLabel('Email', { exact: true }).first().press('Enter');
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('heading', { name: 'You are all set.' })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('the control: a button that leads to the form', () => {
  test('has no field in the hero, and its button takes the visitor to the form', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'cta_button');
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(1);

    await page.getByRole('link', { name: 'Start for free' }).first().click();
    await expect(page).toHaveURL(/#signup$/);
    await expect(page.getByLabel('Email', { exact: true })).toBeInViewport();
    await expectAccessible(page);

    const email = uniqueEmail();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Email', { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();

    await flushEvents(page);
    const names = sent.events.map((event) => event.name).filter((name) => name !== 'web_vitals');
    expect(names).toEqual(['landing_viewed', 'cta_clicked', 'signup_started', 'signup_submitted']);
    expect(sent.events.find((event) => event.name === 'cta_clicked')?.properties).toEqual({
      cta_name: 'start_free',
      cta_location: 'hero',
    });
    expect(sent.events.find((event) => event.name === 'signup_submitted')).toMatchObject({
      properties: { form_location: 'closing' },
      context: { experiments: 'hero_signup:cta_button' },
    });
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the form still creates the account and says so', async ({ page, baseURL }) => {
    await openAs(page, baseURL, 'inline_email', { scripted: false });
    const email = uniqueEmail();
    await page.getByLabel('Email', { exact: true }).first().fill(email);
    await page.getByRole('button', { name: 'Start for free' }).first().click();
    await expect(page).toHaveURL(/\/signup\/done\/$/);
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();

    // The same visitor submitting again is the same request. Someone else is told why not.
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).first().fill(email);
    await page.getByLabel('Email', { exact: true }).first().press('Enter');
    await expect(page).toHaveURL(/\/signup\/done\/$/);

    await page.context().clearCookies();
    await openAs(page, baseURL, 'inline_email', { scripted: false });
    await page.getByLabel('Email', { exact: true }).first().fill(email);
    await page.getByLabel('Email', { exact: true }).first().press('Enter');
    await expect(page).toHaveURL(/\/signup\/email-taken\/$/);
    await expect(page.getByRole('link', { name: 'Log in on the real site' })).toBeVisible();
  });

  test('a bad email lands on a page that explains it and leads back', async ({ page, baseURL }) => {
    await openAs(page, baseURL, 'cta_button', { scripted: false });
    await page.getByRole('link', { name: 'Start for free' }).first().click();
    await page.getByLabel('Email', { exact: true }).fill('ada@');
    await page.getByLabel('Email', { exact: true }).press('Enter');
    await expect(page).toHaveURL(/\/signup\/invalid\/$/);
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/\/#signup$/);
  });
});

test('the pages a plain form signup lands on are accessible', async ({ page }) => {
  for (const outcome of ['done', 'email-taken', 'invalid', 'try-again']) {
    await page.goto(`/signup/${outcome}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
});

test.describe('what the tracker records', () => {
  test('one signup_started per page load, whichever form is typed into first', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'inline_email');
    await page.getByLabel('Email', { exact: true }).last().fill('ada');
    await page.getByLabel('Email', { exact: true }).first().fill('ada');
    await flushEvents(page);
    const started = sent.events.filter((event) => event.name === 'signup_started');
    expect(started.map((event) => event.properties)).toEqual([{ form_location: 'closing' }]);
  });

  test('nothing on an arm opened directly: it is a preview, not a visit', async ({ page }) => {
    const sent = recordEvents(page);
    await page.goto('/variants/inline_email/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).first().fill('ada@');
    await page.getByLabel('Email', { exact: true }).first().press('Enter');
    await flushEvents(page);
    expect(sent.events).toEqual([]);
  });

  test('a failure while offline is still recorded once the connection is back', async ({
    page,
    baseURL,
    context,
  }) => {
    // What the collector actually received: bodies of the requests it answered.
    const received: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('/api/events') && response.status() === 202) {
        received.push(response.request().postData() ?? '');
      }
    });
    await openAs(page, baseURL, 'inline_email');

    await context.setOffline(true);
    const field = page.getByLabel('Email', { exact: true }).first();
    await field.fill(uniqueEmail());
    await field.press('Enter');
    await expect(page.getByRole('alert').first()).toContainText('offline');
    await page.waitForTimeout(2500); // the tracker's own flush, which cannot reach the collector
    expect(received.join()).not.toContain('signup_failed');

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => received.join()).toContain('"reason":"offline"');
  });
});
