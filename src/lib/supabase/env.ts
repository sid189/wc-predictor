/**
 * Returns the env var value, or throws a clear error naming the missing key
 * instead of a cryptic "supabaseUrl is required" from deep inside the SDK.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}
