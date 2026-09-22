"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Seat email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="name@fieldstone.example"
          className="h-11 rounded-lg border border-line bg-raised px-3 text-ink
                     placeholder:text-muted/60 transition-colors duration-150
                     focus:border-(--accent) focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border border-line bg-raised px-3 text-ink
                     transition-colors duration-150
                     focus:border-(--accent) focus:outline-none"
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-(--accent) font-medium text-(--accent-ink)
                   transition-opacity duration-150 hover:opacity-90
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
