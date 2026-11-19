/**
 * The two ways every endpoint answers: JSON, or an RFC 9457 problem built from the
 * registry. Nothing is cacheable, and every answer carries the request id.
 */
import { PROBLEMS, problemType, type Problem, type ProblemCode } from '../../lib/api/problems';

export interface RequestContext {
  url: URL;
  requestId: string;
}

export const requestContext = (request: Request): RequestContext => ({
  url: new URL(request.url),
  requestId: request.headers.get('cf-ray') ?? crypto.randomUUID(),
});

export function jsonResponse(
  context: RequestContext,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  contentType = 'application/json',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': `${contentType}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Request-Id': context.requestId,
      ...headers,
    },
  });
}

export function problemResponse(
  context: RequestContext,
  code: ProblemCode,
  headers: Record<string, string> = {},
  extra: Pick<Problem, 'detail' | 'errors'> = {},
): Response {
  const { status, title } = PROBLEMS[code];
  const problem: Problem = {
    type: problemType(context.url.origin, code),
    title,
    status,
    code,
    instance: context.url.pathname,
    ...extra,
  };
  return jsonResponse(context, status, problem, headers, 'application/problem+json');
}

/** Who to count a public request against: the address Cloudflare saw. */
export const clientKey = (request: Request): string =>
  request.headers.get('CF-Connecting-IP') ?? 'unknown';
