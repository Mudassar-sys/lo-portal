"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { BATCH_SIZE, duplicateKey, type BatchResult, type CsvRow } from "@/lib/borrowers";

/**
 * Every key already held by this organisation.
 *
 * The scoping is the policy's, not this function's: the query names no tenant
 * and gets this tenant's rows. Normalising happens here rather than in SQL
 * because the stored phone number keeps whatever punctuation it arrived with.
 *
 * At prototype volumes one pass per batch is cheap. At real volumes this
 * becomes a stored normalised column with a unique index on
 * (org_id, normalised_email) and (org_id, normalised_phone), which turns
 * duplicate detection into an insert conflict instead of a read.
 */
async function existingKeys(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("borrowers")
    .select("email, phone")
    .limit(20000)
    .returns<Array<{ email: string | null; phone: string | null }>>();

  const keys = new Set<string>();
  for (const row of data ?? []) {
    const key = duplicateKey(row);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Report which rows of a batch already exist, without writing anything.
 *
 * This is what the preview is built from. It is advisory: the commit checks
 * again, because between preview and commit somebody else may have added the
 * same person.
 */
export async function analyzeBatch(rows: CsvRow[]): Promise<BatchResult> {
  await requireClaims();
  const supabase = await createClient();
  const keys = await existingKeys(supabase);

  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    const key = duplicateKey(row);
    if (key && keys.has(key)) duplicates.push(index);
  });

  return { inserted: 0, duplicates, failed: 0, error: null };
}

/**
 * Insert a batch, skipping anything this organisation already holds.
 *
 * org_id and created_by_seat come from the verified claims. Neither is read
 * from the payload, so a crafted request cannot place a row in another
 * tenant, and the database would refuse it anyway: the insert policy's WITH
 * CHECK compares org_id against the claim.
 */
export async function importBatch(rows: CsvRow[]): Promise<BatchResult> {
  const claims = await requireClaims();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, duplicates: [], failed: 0, error: null };
  }
  if (rows.length > BATCH_SIZE) {
    return {
      inserted: 0,
      duplicates: [],
      failed: rows.length,
      error: `A batch may hold at most ${BATCH_SIZE} rows.`,
    };
  }

  const supabase = await createClient();
  const keys = await existingKeys(supabase);

  const duplicates: number[] = [];
  const toInsert: Array<Record<string, unknown>> = [];

  rows.forEach((row, index) => {
    const key = duplicateKey(row);
    // A file that repeats a person twice is caught here too: the key is added
    // to the same set as it goes by, so the second copy is a duplicate.
    if (key && keys.has(key)) {
      duplicates.push(index);
      return;
    }
    if (key) keys.add(key);
    toInsert.push({
      org_id: claims.orgId,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      source: "csv",
      created_by_seat: claims.seatId,
    });
  });

  if (toInsert.length === 0) {
    return { inserted: 0, duplicates, failed: 0, error: null };
  }

  const { error, count } = await supabase
    .from("borrowers")
    .insert(toInsert, { count: "exact" });

  if (error) {
    return { inserted: 0, duplicates, failed: toInsert.length, error: error.message };
  }

  revalidatePath("/borrowers");
  return { inserted: count ?? toInsert.length, duplicates, failed: 0, error: null };
}
