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
    await expect(page.getByRole('link', { name: 'log in at app.fxreplay.com' })).toBeVisible();
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

    await expect(page.getByRole('alert').first()).toContainText('went wrong on our side');
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

    await page.getByRole('main').getByRole('link', { name: 'Start for free' }).first().click();
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
    await expect(
      page.getByRole('link', { name: "The real site's login, at app.fxreplay.com" }),
    ).toBeVisible();
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

test.describe('before the script takes over', () => {
  test('an email typed while the script is still loading is kept, and signs up', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/_astro/*.js', async (route) => {
      await held;
      await route.continue();
    });
    // The load event waits for the scripts held above, so the test does not wait for it.
    await openAs(page, baseURL, 'inline_email', { scripted: false, waitUntil: 'commit' });

    const field = page.getByLabel('Email', { exact: true }).first();
    const email = uniqueEmail();
    await field.fill(email);
    release();
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

    await expect(field).toHaveValue(email);
    await field.press('Enter');
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeVisible();
    await flushEvents(page);
    expect(sent.events.map((event) => event.name)).toEqual(
      expect.arrayContaining(['signup_started', 'signup_submitted']),
    );
    expect(sent.events.some((event) => event.name === 'signup_failed')).toBe(false);
  });
});

test.describe('the hero illustration', () => {
  test('its controls do what they show: one candle, speed, play and pause', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'cta_button');
    const figure = page.locator('[data-replay].ready');
    const controls = figure.getByRole('group', { name: 'Controls of the replay illustration' });
    const drawn = () =>
      figure
        .locator('.candle')
        .evaluateAll(
          (candles) => candles.filter((candle) => getComputedStyle(candle).opacity !== '0').length,
        );

    await controls.getByRole('button', { name: 'Next candle' }).click();
    await expect.poll(drawn).toBe(28);

    await controls.getByRole('button', { name: 'Speed: 1x' }).click();
    await expect(controls.getByRole('button', { name: 'Speed: 2x' })).toHaveText('2x');

    await controls.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(drawn).toBeGreaterThan(30);
    await controls.getByRole('button', { name: 'Pause' }).click();
    // A candle revealed just before the pause is still fading in, so what is drawn can
    // trail by one for a moment. The replay's own position is what must not move.
    const revealed = () => figure.locator('.candle:not(.ahead)').count();
    const paused = await revealed();
    await page.waitForTimeout(700);
    expect(await revealed()).toBe(paused);
    await expect.poll(drawn).toBe(paused);

    await flushEvents(page);
    const used = sent.events.filter((event) => event.name === 'replay_demo_used');
    expect(used.map((event) => event.properties)).toEqual([{ control: 'step' }]);
  });
});

/** Every element that shows text of its own in a size below the floor. */
const textBelowFloor = () =>
  [...document.querySelectorAll('body *')]
    .filter(
      (element) =>
        element.getClientRects().length > 0 &&
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        ) &&
        parseFloat(getComputedStyle(element).fontSize) < 16,
    )
    .map((element) => `${element.tagName} "${element.textContent?.trim().slice(0, 40)}"`);

test.describe('legibility', () => {
  for (const arm of ['cta_button', 'inline_email'] as const) {
    test(`no text on the page is set below 16px (${arm})`, async ({ page, baseURL }) => {
      await openAs(page, baseURL, arm);
      expect(await page.evaluate(textBelowFloor)).toEqual([]);
    });
  }

  // The pages a visitor reaches without the landing page's styles around them.
  for (const path of ['/signup/done/', '/signup/email-taken/', '/problems/email-taken/', '/nope']) {
    test(`no text is set below 16px on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await page.evaluate(textBelowFloor)).toEqual([]);
    });
  }
});

test.describe('the header', () => {
  test('stays on screen, and its call to action leads to the form from anywhere', async ({
    page,
    baseURL,
  }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'inline_email');
    await page.getByRole('heading', { name: 'Fair questions.' }).scrollIntoViewIfNeeded();

    const cta = page.getByRole('banner').getByRole('link', { name: 'Start for free' });
    await expect(cta).toBeInViewport();
    await cta.click();
    await expect(page).toHaveURL(/#signup$/);
    await expect(page.getByLabel('Email', { exact: true }).last()).toBeFocused();

    await flushEvents(page);
    expect(sent.events.find((event) => event.name === 'cta_clicked')?.properties).toEqual({
      cta_name: 'start_free',
      cta_location: 'header',
    });
  });

  for (const arm of ['cta_button', 'inline_email'] as const) {
    for (const width of [320, 360, 768]) {
      test(`fits its column and the page does not scroll sideways at ${width}px (${arm})`, async ({
        page,
        baseURL,
      }) => {
        await page.setViewportSize({ width, height: 780 });
        await openAs(page, baseURL, arm);
        const measured = await page.evaluate(() => {
          const right = (selector: string) =>
            document.querySelector(selector)?.getBoundingClientRect().right ?? Infinity;
          return {
            page: document.documentElement.scrollWidth,
            screen: document.documentElement.clientWidth,
            cta: right('header [data-cta]'),
            column: right('header .shell'),
          };
        });
        expect(measured.page).toBeLessThanOrEqual(measured.screen);
        expect(measured.cta).toBeLessThanOrEqual(measured.column + 0.5);
      });
    }
  }

  test('does not cover the skip link, the first stop of the keyboard', async ({
    page,
    baseURL,
  }) => {
    await openAs(page, baseURL, 'inline_email');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to sign up' });
    await expect(skip).toBeFocused();
    // What a sighted keyboard user sees at the link's centre is the link, not the header.
    const onTop = await skip.evaluate((link) => {
      const box = link.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top === link || link.contains(top);
    });
    expect(onTop).toBe(true);
  });

  test('never covers the control that has keyboard focus, walking back up the page', async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openAs(page, baseURL, 'inline_email');
    await page.getByRole('contentinfo').getByRole('link').last().focus();
    for (let stop = 0; stop < 24; stop += 1) {
      await page.keyboard.press('Shift+Tab');
      const covered = await page.evaluate(() => {
        const focused = document.activeElement;
        const header = document.querySelector('header');
        // The skip link sits above the header on purpose, and has its own test.
        const exempt = focused === document.body || focused?.matches('.skip');
        if (!focused || !header || exempt || header.contains(focused)) return null;
        const box = focused.getBoundingClientRect();
        return box.top < header.getBoundingClientRect().bottom - 1
          ? `${focused.tagName} "${focused.textContent?.trim().slice(0, 30)}" at ${Math.round(box.top)}`
          : null;
      });
      expect(covered).toBeNull();
    }
  });

  test('leaves Back to return to where the visitor was on the page', async ({ page, baseURL }) => {
    await openAs(page, baseURL, 'cta_button');
    await page.getByRole('main').getByRole('link', { name: 'Start for free' }).first().click();
    await expect(page).toHaveURL(/#signup$/);
    await page.goBack();
    // Still this page, without the anchor: not the page the visitor came from.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute(
      'data-experiments',
      'hero_signup:cta_button',
    );
  });

  test('counts a double click on a call to action once', async ({ page, baseURL }) => {
    const sent = recordEvents(page);
    await openAs(page, baseURL, 'cta_button');
    await page.getByRole('main').getByRole('link', { name: 'Start for free' }).first().dblclick();
    await flushEvents(page);
    expect(sent.events.filter((event) => event.name === 'cta_clicked')).toHaveLength(1);
  });
});

test.describe('the profile step on a phone', () => {
  for (const [arm, width, height] of [
    ['cta_button', 360, 780],
    ['inline_email', 360, 780],
    ['inline_email', 320, 640],
  ] as const) {
    test(`nothing covers the option that has keyboard focus (${arm}, ${width}px)`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize({ width, height });
      await openAs(page, baseURL, arm);
      await page.getByLabel('Email', { exact: true }).last().fill(uniqueEmail());
      await page.getByLabel('Email', { exact: true }).last().press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Your free account is ready.' }),
      ).toBeFocused();

      // Every option, then the two buttons: what a sighted keyboard user sees at the centre
      // of the control with focus is that control, not a bar or a header drawn over it.
      for (let stop = 0; stop < 13; stop += 1) {
        await page.keyboard.press('Tab');
        const covered = await page.evaluate(() => {
          const focused = document.activeElement;
          if (!focused?.closest('.signup-profile')) return null;
          const shown = focused.closest('label') ?? focused;
          const box = shown.getBoundingClientRect();
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return top && shown.contains(top)
            ? null
            : `${shown.textContent?.trim().slice(0, 30)} at ${Math.round(box.top)}`;
        });
        expect(covered).toBeNull();
      }
    });
  }
});

test.describe('after the account exists', () => {
  test('the page stops asking: the other form and the other calls to action step aside', async ({
    page,
    baseURL,
  }) => {
    await openAs(page, baseURL, 'inline_email');
    await page.getByLabel('Email', { exact: true }).first().fill(uniqueEmail());
    await page.getByRole('button', { name: 'Start for free' }).first().click();
    await expect(page.getByRole('heading', { name: 'Your free account is ready.' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'You have already signed up.' })).toBeVisible();

    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Start for free' }),
    ).toBeHidden();
    await expect(page.getByRole('link', { name: 'Start for free' })).toHaveCount(0);
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    await expectAccessible(page);
  });
});
