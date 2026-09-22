"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { NEXT_STATUS } from "@/lib/submissions";

export interface SubmissionState {
  error: string | null;
  message: string | null;
}

/**
 * Move a submission along, or assign it to a seat.
 *
 * Both are ordinary updates, and both are refused by the database for a loan
 * officer: the update policy on submissions names org_admin and manager only.
 * That refusal is silent by design, because a policy's USING clause filters
 * rather than raises, so the action checks how many rows it actually changed
 * and says so plainly instead of reporting a success that did not happen.
 */
export async function advanceSubmission(
  submissionId: string,
  status: string
): Promise<SubmissionState> {
  await requireClaims();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", submissionId)
    .maybeSingle<{ id: string; status: string }>();

  if (!current) {
    return { error: "That submission is not on this organisation's book.", message: null };
  }
  if (!(NEXT_STATUS[current.status] ?? []).includes(status)) {
    return {
      error: `A submission cannot go from ${current.status.replace("_", " ")} to ${status.replace("_", " ")}.`,
      message: null,
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "submitted") patch.submitted_at = now;
  if (status === "approved" || status === "declined") patch.decided_at = now;

  const { error, count } = await supabase
    .from("submissions")
    .update(patch, { count: "exact" })
    .eq("id", submissionId);

  if (error) return { error: error.message, message: null };
  if (!count) {
    return { error: "Your seat is not allowed to move a submission.", message: null };
  }

  revalidatePath("/submissions");
  return { error: null, message: `Moved to ${status.replace("_", " ")}.` };
}

export async function assignSubmission(
  submissionId: string,
  seatId: string | null
): Promise<SubmissionState> {
  await requireClaims();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("submissions")
    .update({ assigned_seat: seatId }, { count: "exact" })
    .eq("id", submissionId);

  if (error) return { error: error.message, message: null };
  if (!count) {
    return { error: "Your seat is not allowed to reassign a submission.", message: null };
  }

  revalidatePath("/submissions");
  return { error: null, message: "Reassigned." };
}
