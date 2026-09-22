"use client";

import { useActionState } from "react";
import { signOutOtherDevices, type SessionsState } from "./actions";

const initial: SessionsState = { message: null, error: null };

export function SignOutOthers() {
  const [state, formAction, pending] = useActionState(
    async () => signOutOtherDevices(),
    initial
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-line px-3 py-1.5 text-sm
                     transition-colors duration-150 hover:bg-raised
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Ending other sessions" : "Sign out other devices"}
        </button>
      </form>

      {state.message ? (
        <p role="status" className="text-sm text-ok text-pretty">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-bad text-pretty">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
