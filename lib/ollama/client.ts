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

/** Calls Ollama's /api/generate with a fully-built prompt. Not wired into any route yet. */
export async function generateCompletion(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
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
