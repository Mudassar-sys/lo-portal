"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";

export interface SessionsState {
  message: string | null;
  error: string | null;
}

/**
 * End this account's other sessions and keep this one.
 *
 * signOut defaults to the global scope, which would end this session too. The
 * "others" scope is the one that matches the button: it revokes the refresh
 * tokens of every other session for this account and leaves the current one
 * alone. Note the documented consequence: an access token already in another
 * device's hands stays valid until it expires, so the project's 600 second
 * token lifetime is the worst case delay before that device is actually out.
 *
 * The seat is then pointed at this session, so the roster tells the truth
 * immediately rather than after the next refresh.
 */
export async function signOutOtherDevices(): Promise<SessionsState> {
  const claims = await requireClaims();
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return { message: null, error: error.message };
  }

  if (claims.sessionId) {
    const { error: seatError } = await supabase.rpc("claim_seat_session", {
      p_session_id: claims.sessionId,
    });
    if (seatError) {
      return { message: null, error: seatError.message };
    }
  }

  revalidatePath("/sessions");
  return {
    message:
      "Other sessions for this account have been ended. A device that is already holding a token keeps it until the token expires, which is at most ten minutes.",
    error: null,
  };
}
