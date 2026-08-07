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

export const config = {
  supabase: {
    url: readRequired('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: readRequired('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: readRequired('SUPABASE_SERVICE_ROLE_KEY'),
  },
  ollama: {
    baseUrl: readOptional('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: readRequired('OLLAMA_MODEL'),
  },
} as const;
