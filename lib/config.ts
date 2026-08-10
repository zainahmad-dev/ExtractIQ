function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill in a value.`
    );
  }
  return value;
}

function readOptional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Every value is read on access rather than at import. Reading them eagerly
 * made a missing variable throw while the module was still being evaluated,
 * which is before any route handler exists to fail inside — so the request
 * died as an unhandled module-initialization error (an HTML error page,
 * stack trace and all) that lib/api-error-handler.ts had no way to catch.
 * Deferred like this, the same error is thrown inside the handler and comes
 * back as the usual `{ error: string }` JSON. The shape, names, and messages
 * are unchanged; only the moment of the throw moved.
 */
export const config = {
  supabase: {
    get url(): string {
      return readRequired('NEXT_PUBLIC_SUPABASE_URL');
    },
    get anonKey(): string {
      return readRequired('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    },
    get serviceRoleKey(): string {
      return readRequired('SUPABASE_SERVICE_ROLE_KEY');
    },
  },
  ollama: {
    get baseUrl(): string {
      return readOptional('OLLAMA_BASE_URL', 'http://localhost:11434');
    },
    get model(): string {
      return readRequired('OLLAMA_MODEL');
    },
  },
} as const;
