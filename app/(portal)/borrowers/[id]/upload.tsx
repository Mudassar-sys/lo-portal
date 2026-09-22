"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordDocument } from "./documents-actions";
import { ALLOWED_TYPES, MAX_BYTES } from "@/lib/documents";
import { buttonClass } from "@/components/ui";

/**
 * Upload a borrower document.
 *
 * The file goes straight from the browser to storage using this user's own
 * session, so the storage policies are what decide whether the object may
 * exist: the path has to begin with this organisation's id, and the bucket
 * enforces its own size and type limits. The server action afterwards records
 * the row and re-checks both against what storage actually holds.
 *
 * The checks in this component are a courtesy so the person is told at once.
 * They are not the enforcement, and the verification run proves that by
 * bypassing them.
 */
export function UploadDocument({ borrowerId, orgId }: { borrowerId: string; orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setError(null);
    setMessage(null);

    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`${file.type || "That file type"} is not accepted. Use a PDF, a PNG or a JPEG.`);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${orgId}/${borrowerId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("borrower-docs")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const result = await recordDocument(borrowerId, path, file.name);
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "The upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <label className={`${buttonClass.secondary} cursor-pointer`}>
        {busy ? "Uploading" : "Add a document"}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="max-w-sm text-right text-xs text-bad text-pretty">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-ok">
          {message}
        </p>
      ) : null}
    </div>
  );
}
