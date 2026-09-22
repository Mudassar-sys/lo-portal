"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { ALLOWED_TYPES, MAX_BYTES } from "@/lib/documents";

export interface UploadRecordState {
  error: string | null;
  message: string | null;
}

/**
 * Record a document that has just been uploaded to storage.
 *
 * Why the file itself does not pass through here: a server action body is
 * capped at 1 MB by default and the hosting platform caps a request at
 * 4.5 MB, so a 10 MB document cannot travel this way at all. The browser
 * uploads straight to storage using the signed in user's own session, which
 * means the storage policies decide whether the object may exist. This action
 * then records it.
 *
 * That split is also why this function trusts nothing the caller says about
 * the file. The size and the type are read back from storage, not from the
 * form, and the folder is rebuilt from the verified claims rather than
 * accepted as a path. A caller that uploads something the bucket allows but
 * the portal does not want gets the object removed again.
 */
export async function recordDocument(
  borrowerId: string,
  objectPath: string,
  filename: string
): Promise<UploadRecordState> {
  const claims = await requireClaims();
  const supabase = await createClient();

  // The borrower has to be one this seat can see. Another tenant's id
  // resolves to nothing, so there is no folder to record against.
  const { data: borrower } = await supabase
    .from("borrowers")
    .select("id")
    .eq("id", borrowerId)
    .maybeSingle<{ id: string }>();

  if (!borrower) {
    return { error: "That borrower is not on this organisation's book.", message: null };
  }

  // The prefix is built here, from the claim. It is never taken from input.
  const expectedPrefix = `${claims.orgId}/${borrower.id}/`;
  if (!objectPath.startsWith(expectedPrefix) || objectPath.includes("..")) {
    return { error: "That object is not in this borrower's folder.", message: null };
  }

  // Ask storage what it actually holds. The browser's idea of the size and
  // the type is not evidence.
  const folder = objectPath.slice(0, objectPath.lastIndexOf("/"));
  const name = objectPath.slice(objectPath.lastIndexOf("/") + 1);
  const { data: listed, error: listError } = await supabase.storage
    .from("borrower-docs")
    .list(folder, { search: name, limit: 100 });

  if (listError) {
    return { error: listError.message, message: null };
  }

  const object = (listed ?? []).find((entry) => entry.name === name);
  if (!object) {
    return { error: "That object is not in storage.", message: null };
  }

  const size = Number(object.metadata?.size ?? 0);
  const mimetype = String(object.metadata?.mimetype ?? "");

  const remove = async () => {
    await supabase.storage.from("borrower-docs").remove([objectPath]);
  };

  if (size <= 0) {
    await remove();
    return { error: "That file is empty.", message: null };
  }
  if (size > MAX_BYTES) {
    await remove();
    return {
      error: `That file is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`,
      message: null,
    };
  }
  if (!ALLOWED_TYPES.includes(mimetype)) {
    await remove();
    return {
      error: `${mimetype || "That file type"} is not accepted. Use a PDF, a PNG or a JPEG.`,
      message: null,
    };
  }

  const { error } = await supabase.from("documents").insert({
    org_id: claims.orgId,
    borrower_id: borrower.id,
    storage_path: objectPath,
    filename,
    size_bytes: size,
    uploaded_by_seat: claims.seatId,
  });

  if (error) {
    await remove();
    return { error: error.message, message: null };
  }

  revalidatePath(`/borrowers/${borrower.id}`);
  return { error: null, message: `${filename} was added.` };
}

/**
 * Remove a document.
 *
 * The row goes through a policy that allows it for an administrator or a
 * manager only, and the object goes through the storage policy, which
 * requires the same. A loan officer pressing this gets nothing removed.
 */
export async function removeDocument(documentId: string): Promise<UploadRecordState> {
  await requireClaims();
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id, borrower_id, storage_path, filename")
    .eq("id", documentId)
    .maybeSingle<{ id: string; borrower_id: string; storage_path: string; filename: string }>();

  if (!document) {
    return { error: "That document is not on this organisation's book.", message: null };
  }

  const { error, count } = await supabase
    .from("documents")
    .delete({ count: "exact" })
    .eq("id", documentId);

  if (error) return { error: error.message, message: null };
  if (!count) {
    return { error: "Your seat is not allowed to remove documents.", message: null };
  }

  await supabase.storage.from("borrower-docs").remove([document.storage_path]);
  revalidatePath(`/borrowers/${document.borrower_id}`);
  return { error: null, message: `${document.filename} was removed.` };
}
