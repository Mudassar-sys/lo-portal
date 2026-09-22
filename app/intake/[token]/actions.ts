"use server";

import { createClient } from "@/lib/supabase/server";

export interface IntakeState {
  error: string | null;
  done: boolean;
}

/**
 * The public borrower intake.
 *
 * This is the only write path in the portal that runs without a session, and
 * it is deliberately the narrowest one. It calls a security definer function
 * that resolves the organisation from the link token itself, so the caller
 * never names a tenant and cannot choose one. The anon role holds no table
 * privileges at all; if this function did not exist, an unauthenticated
 * visitor could do nothing whatsoever.
 */
export async function submitIntake(
  _previous: IntakeState,
  formData: FormData
): Promise<IntakeState> {
  const token = String(formData.get("token") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!firstName || !lastName) {
    return { error: "Please give your first and last name.", done: false };
  }
  if (!email && !phone) {
    return { error: "Please give an email address or a phone number.", done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_intake", {
    p_token: token,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email || null,
    p_phone: phone || null,
  });

  if (error) {
    return { error: error.message, done: false };
  }

  return { error: null, done: true };
}
