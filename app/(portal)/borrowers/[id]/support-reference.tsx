"use client";

import { useState } from "react";

/**
 * The record's identifier, where support needs it and nobody else has to look
 * at it.
 *
 * A loan officer does not want a UUID next to a borrower's phone number. They
 * do want something to quote when they call for help, so it sits in the
 * footer, shortened, and copies the full value when pressed.
 */
export function SupportReference({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Reference for support</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        title={id}
        className="rounded border border-line px-1.5 py-0.5 font-mono transition-colors duration-150 hover:bg-raised"
      >
        {id.slice(0, 8)}
      </button>
      {copied ? <span className="text-ok">copied in full</span> : null}
    </p>
  );
}
