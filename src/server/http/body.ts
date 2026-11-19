/**
 * Reads a request body as text without ever holding more than `maxBytes` of it. A declared
 * length over the limit is refused unread. Otherwise the stream is read chunk by chunk and
 * cancelled as soon as it passes the limit, so a large chunked body is never buffered.
 */
export type BodyText = { ok: true; text: string } | { ok: false };

export async function readBodyText(request: Request, maxBytes: number): Promise<BodyText> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) return { ok: false };
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
