import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SECURITY_HEADERS, withSecurityHeaders } from '../../src/server/http/security-headers';

/** The headers of one rule in a Cloudflare `_headers` file, in the order written. */
function rule(file: string, pattern: string): [string, string][] {
  const lines = file.split('\n');
  const start = lines.findIndex((line) => line === pattern);
  if (start === -1) throw new Error(`no rule for ${pattern}`);
  const headers: [string, string][] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const [name, ...value] = line.trim().split(':');
    headers.push([name ?? '', value.join(':').trim()]);
  }
  return headers;
}

describe('the security headers', () => {
  it('are the same for the asset store as for the Worker', () => {
    const file = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(Object.fromEntries(rule(file, '/*'))).toEqual(SECURITY_HEADERS);
    // The build prepends the immutable rule for /_astro/*. A Cache-Control on /* would be
    // joined to it with a comma.
    expect(rule(file, '/*').map(([name]) => name.toLowerCase())).not.toContain('cache-control');
  });

  it('allow no script or style source in the header, so the page policy decides them', () => {
    const policy = SECURITY_HEADERS['Content-Security-Policy'];
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/default-src|script-src|style-src|unsafe-/);
  });

  it('are set on a response, each exactly once, replacing a copy already there', () => {
    const response = withSecurityHeaders(
      new Response('ok', {
        status: 201,
        headers: { 'Content-Type': 'text/plain', 'X-Frame-Options': 'SAMEORIGIN' },
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('text/plain');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it('are set on a response whose headers cannot be changed, by copying it', async () => {
    const original = Response.redirect('https://demo.example/signup/done/', 303);
    expect(() => original.headers.set('X-Test', '1')).toThrow();
    const response = withSecurityHeaders(original);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://demo.example/signup/done/');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(await response.text()).toBe('');
  });
});
