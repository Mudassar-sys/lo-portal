"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";

export interface BrandingState {
  error: string | null;
  message: string | null;
}

/**
 * Rebrand the organisation.
 *
 * Three columns, and only three, because the update grant on organizations is
 * column level: display_name, logo_url and accent_color. An administrator
 * cannot write `premium` from here or from anywhere else, and the attempt is
 * refused by the database rather than hidden by this form.
 */
export async function updateBranding(
  _previous: BrandingState,
  formData: FormData
): Promise<BrandingState> {
  const claims = await requireClaims();
  const supabase = await createClient();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const accent = String(formData.get("accent_color") ?? "").trim();
  const logo = String(formData.get("logo_url") ?? "").trim();

  if (displayName.length < 2) {
    return { error: "Give the organisation a name.", message: null };
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) {
    return { error: "The accent colour has to be a six digit hex value, like #4f7cff.", message: null };
  }

  const { error, count } = await supabase
    .from("organizations")
    .update(
      { display_name: displayName, accent_color: accent, logo_url: logo || null },
      { count: "exact" }
    )
    .eq("id", claims.orgId);

  if (error) return { error: error.message, message: null };
  if (!count) {
    return { error: "Only an administrator can rebrand this organisation.", message: null };
  }

  revalidatePath("/", "layout");
  return { error: null, message: "Saved. The accent changes everywhere at once." };
}
