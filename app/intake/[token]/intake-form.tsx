"use client";

import { useActionState } from "react";
import { submitIntake, type IntakeState } from "./actions";

const initial: IntakeState = { error: null, done: false };

const FIELD =
  "h-11 w-full rounded-lg border border-line bg-raised px-3 text-sm transition-colors " +
  "duration-150 placeholder:text-muted/60 focus:border-(--accent) focus:outline-none";

export function IntakeForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, formAction, pending] = useActionState(submitIntake, initial);

  if (state.done) {
    return (
      <div className="rounded-card border border-ok/40 bg-ok/10 p-6 text-center">
        <p className="font-medium">Thank you. {orgName} has your details.</p>
        <p className="mt-1 text-sm text-muted text-pretty">
          Someone will be in touch. Nothing else is needed from you now.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">First name</span>
          <input name="first_name" required autoComplete="given-name" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Last name</span>
          <input name="last_name" required autoComplete="family-name" className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" autoComplete="email" className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Phone</span>
        <input name="phone" type="tel" autoComplete="tel" className={FIELD} />
      </label>

      <p className="text-xs text-muted text-pretty">
        One of the two is enough. Whichever you give is how {orgName} will reach you.
      </p>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-(--accent) font-medium text-(--accent-ink)
                   transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending" : "Send my details"}
      </button>
    </form>
  );
}
