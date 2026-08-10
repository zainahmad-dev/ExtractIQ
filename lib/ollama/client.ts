import { config } from '@/lib/config';

export interface OllamaHealthResult {
  healthy: boolean;
  version?: string;
  message?: string;
}

/** Pings the Ollama server itself — does not require any model to be pulled. */
export async function checkOllamaHealth(): Promise<OllamaHealthResult> {
  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/version`);

    if (!response.ok) {
      return { healthy: false, message: `Ollama responded with HTTP ${response.status}` };
    }

    const data = (await response.json()) as { version?: string };
    return { healthy: true, version: data.version };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : 'Unknown error contacting Ollama',
    };
  }
}

export interface GenerateOptions {
  /** 'json' for loose JSON mode, or a JSON Schema object for constrained decoding. */
  format?: 'json' | Record<string, unknown>;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  totalDurationMs: number;
}

interface OllamaGenerateResponse {
  response: string;
  model: string;
  total_duration?: number;
}

/**
 * Node's fetch reports every transport failure as the same opaque "fetch
 * failed"; the socket-level code that says *why* (ECONNREFUSED when Ollama
 * isn't running, ENOTFOUND for a bad host) hangs off error.cause. Both are
 * surfaced so the reason that ends up on documents.error_reason names the
 * actual problem.
 */
function describeTransportFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const cause: unknown = error.cause;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : null;
  return code ? `${error.message} (${code})` : error.message;
}

/** Calls Ollama's /api/generate with a fully-built prompt. Not wired into any route yet. */
export async function generateCompletion(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.model,
        prompt,
        stream: false,
        ...(options.format !== undefined ? { format: options.format } : {}),
        ...(options.temperature !== undefined
          ? { options: { temperature: options.temperature } }
          : {}),
      }),
    });
  } catch (error) {
    throw new Error(
      `Ollama is unreachable at ${config.ollama.baseUrl}: ${describeTransportFailure(error)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Ollama generate failed with HTTP ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as OllamaGenerateResponse;

  return {
    text: data.response,
    model: data.model,
    totalDurationMs: data.total_duration ? data.total_duration / 1_000_000 : 0,
  };
}
