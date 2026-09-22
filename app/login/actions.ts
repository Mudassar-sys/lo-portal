"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
}

/**
 * Sign in, then take the named seat for this session.
 *
 * The access token hook has already decided whether this account may have a
 * token at all: an account with no seat is refused, and a seat that is held by
 * another live session is taken over here rather than locking the person out
 * of their own seat. Calling claim_seat_session afterwards is deliberate
 * belt and braces, and it is a function rather than an update because the
 * update grant on seats does not include the session columns.
 */
export async function signIn(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter the seat email address and the password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The hook refuses a token for an account that holds no seat, which
    // arrives here as a sign in failure. Say which of the two it is.
    const message = /seat/i.test(error.message)
      ? error.message
      : "That email address and password do not match a seat on this network.";
    return { error: message };
  }

  const { data } = await supabase.auth.getClaims();
  const sessionId = data?.claims?.session_id;
  if (typeof sessionId === "string" && sessionId.length > 0) {
    await supabase.rpc("claim_seat_session", { p_session_id: sessionId });
  }

  redirect("/");
}

/**
 * Sign out of this device only.
 *
 * The default scope is global, which would end the person's sessions
 * everywhere. A sign out button should end this one, so the scope is stated.
 * The seat is released at the same time, otherwise the roster would keep
 * showing a session that no longer exists.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("claim_seat_session", { p_session_id: null });
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
