import { describe, expect, it } from 'vitest';

import { readBodyText } from '../../src/server/http/body';

const LIMIT = 16;
const encoder = new TextEncoder();

const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://demo.example/api/users', { method: 'POST', body, headers });

/** A streamed body with no Content-Length, which records whether it was cancelled. */
function streamed(chunks: string[]) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[state.pulled];
        state.pulled += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    // Pull only when the reader asks, so `pulled` counts what was actually read.
    { highWaterMark: 0 },
  );
  const body = new Request('https://demo.example/api/users', {
    method: 'POST',
    body: stream,
    // Node requires this for a stream body. The Workers runtime does not.
    duplex: 'half',
  } as RequestInit);
  return { request: body, state };
}

describe('readBodyText', () => {
  it('reads a body under the limit', async () => {
    expect(await readBodyText(request('{"a":1}'), LIMIT)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('reads a body of exactly the limit, counted in bytes', async () => {
    const text = 'é'.repeat(LIMIT / 2); // two bytes each
    expect(await readBodyText(request(text), LIMIT)).toEqual({ ok: true, text });
  });

  it('refuses a body one byte over the limit', async () => {
    expect(await readBodyText(request('x'.repeat(LIMIT + 1)), LIMIT)).toEqual({ ok: false });
  });

  it('refuses a declared length over the limit without reading the body', async () => {
    const { request: big, state } = streamed(['x']);
    big.headers.set('Content-Length', String(LIMIT + 1));
    expect(await readBodyText(big, LIMIT)).toEqual({ ok: false });
    expect(state.pulled).toBe(0);
  });

  it('refuses a body over the limit that declares no length', async () => {
    const { request: big, state } = streamed(['x'.repeat(LIMIT + 1)]);
    expect(big.headers.get('Content-Length')).toBeNull();
    expect(await readBodyText(big, LIMIT)).toEqual({ ok: false });
    expect(state.cancelled).toBe(true);
  });

  it('stops and cancels the stream on the chunk that passes the limit', async () => {
    const { request: big, state } = streamed(['x'.repeat(10), 'y'.repeat(10), 'z', 'z', 'z']);
    expect(await readBodyText(big, LIMIT)).toEqual({ ok: false });
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBe(2);
  });

  it('joins a body that arrives in several chunks under the limit', async () => {
    const { request: chunked } = streamed(['{"a"', ':', '1}']);
    expect(await readBodyText(chunked, LIMIT)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('reads an empty body as empty text', async () => {
    expect(await readBodyText(request(null), LIMIT)).toEqual({ ok: true, text: '' });
    expect(await readBodyText(request(''), LIMIT)).toEqual({ ok: true, text: '' });
  });
});
