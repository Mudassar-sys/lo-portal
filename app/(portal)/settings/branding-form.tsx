"use client";

import { useActionState, useState } from "react";
import { updateBranding, type BrandingState } from "./actions";
import { buttonClass } from "@/components/ui";

const initial: BrandingState = { error: null, message: null };

const FIELD =
  "h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm transition-colors " +
  "duration-150 focus:border-(--accent) focus:outline-none disabled:opacity-60";

export function BrandingForm({
  displayName,
  accentColor,
  logoUrl,
  canEdit,
}: {
  displayName: string;
  accentColor: string;
  logoUrl: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBranding, initial);
  const [accent, setAccent] = useState(accentColor);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Display name</span>
        <input name="display_name" defaultValue={displayName} disabled={!canEdit} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Accent colour</span>
        <span className="flex items-center gap-3">
          <input
            name="accent_color"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            disabled={!canEdit}
            className={`${FIELD} font-mono`}
          />
          <span
            aria-hidden
            className="size-10 shrink-0 rounded-lg border border-line"
            style={{ background: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "transparent" }}
          />
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Logo URL</span>
        <input
          name="logo_url"
          defaultValue={logoUrl ?? ""}
          placeholder="optional"
          disabled={!canEdit}
          className={FIELD}
        />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-ok">
          {state.message}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={!canEdit || pending} className={buttonClass.primary}>
          {pending ? "Saving" : "Save branding"}
        </button>
      </div>
    </form>
  );
}
