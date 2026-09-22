/**
 * Shared document rules.
 *
 * These live here, and not beside the server actions, because a module marked
 * "use server" may only export async functions. Exporting a constant from one
 * does not always fail the build: it can compile and then turn into a server
 * function stub on the client, so `ALLOWED_TYPES.includes(...)` becomes "is
 * not a function" at run time, in the browser, on the first upload. That is
 * exactly how it failed here once.
 */

/** Kept in step with the bucket's allowed_mime_types, set by provision.mjs. */
export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

/** Kept in step with the bucket's file_size_limit. */
export const MAX_BYTES = 10 * 1024 * 1024;

const KINDS: Record<string, string> = {
  pdf: "PDF",
  png: "PNG image",
  jpg: "JPEG image",
  jpeg: "JPEG image",
};

/** What a person would call the file, rather than a MIME type or a path. */
export function documentKind(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return KINDS[extension] ?? "Document";
}
