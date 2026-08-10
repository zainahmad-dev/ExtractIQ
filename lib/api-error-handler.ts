import { NextResponse, type NextRequest } from 'next/server';

/** The single failure shape every API route returns — the client reads `error` and nothing else. */
export interface ApiErrorBody {
  error: string;
}

/**
 * Statuses for the errors shared modules throw. Matched on `name` rather than
 * with `instanceof` so this module stays free of pipeline imports —
 * importing lib/jobs/process-document.ts here would drag pdf-parse,
 * tesseract.js, and sharp into every route's bundle.
 */
const STATUS_BY_ERROR_NAME: Record<string, number> = {
  /** lib/jobs/process-document.ts — the document id doesn't exist. */
  DocumentNotFoundError: 404,
  /** lib/validation/state-machine.ts — the document isn't in a state this action allows. */
  InvalidStatusTransitionError: 409,
};

const FALLBACK_STATUS = 500;
const FALLBACK_MESSAGE = 'An unexpected server error occurred.';

/**
 * Next.js implements redirect(), notFound(), and its static-rendering bailout
 * by throwing a tagged error. Those are control flow, not failures, and have
 * to reach the framework untouched instead of being reported as a 500.
 */
const CONTROL_FLOW_DIGESTS = [
  'NEXT_REDIRECT',
  'NEXT_NOT_FOUND',
  'NEXT_HTTP_ERROR_FALLBACK',
  'DYNAMIC_SERVER_USAGE',
];

function isFrameworkControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return (
    typeof digest === 'string' && CONTROL_FLOW_DIGESTS.some((prefix) => digest.startsWith(prefix))
  );
}

/**
 * Maps a thrown value onto the response the client sees. Only the error's
 * message crosses the wire — a stack trace never does, whatever the cause.
 */
function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof Error) {
    const status = STATUS_BY_ERROR_NAME[error.name] ?? FALLBACK_STATUS;
    return NextResponse.json({ error: error.message || FALLBACK_MESSAGE }, { status });
  }
  return NextResponse.json({ error: FALLBACK_MESSAGE }, { status: FALLBACK_STATUS });
}

type RouteHandler<TArgs extends unknown[]> = (
  request: NextRequest,
  ...args: TArgs
) => Response | Promise<Response>;

/**
 * Wraps a route handler so nothing escapes it as an unhandled exception:
 * anything thrown becomes a `{ error: string }` JSON response with an
 * appropriate status, and the full error (stack included) is logged
 * server-side instead of being sent to the client. Routes still return their
 * own deliberate failures inline — this is the net under them, for the
 * failures they can't anticipate (a dropped Supabase connection, a missing
 * env var, a bug).
 *
 * Successful responses pass through exactly as the handler built them, so no
 * happy-path shape, header, or status changes by being wrapped.
 */
export function withApiErrorHandler<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>
): (request: NextRequest, ...args: TArgs) => Promise<Response> {
  return async (request: NextRequest, ...args: TArgs): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (isFrameworkControlFlow(error)) throw error;
      console.error(`[api] ${request.method} ${request.nextUrl.pathname} failed:`, error);
      return toErrorResponse(error);
    }
  };
}
