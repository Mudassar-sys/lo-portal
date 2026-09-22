import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for code that runs in the browser.
 *
 * It receives the publishable key only. The secret key bypasses row level
 * security and therefore never leaves the server, and never enters a bundle.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
