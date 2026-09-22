import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in to Fieldstone Lending Network",
};

const DEMO_SEATS = [
  { org: "Harborline Mortgage Group", rows: [
    ["Administrator", "harborline.admin@fieldstone.example"],
    ["Manager", "harborline.manager@fieldstone.example"],
    ["Loan officer", "harborline.lo@fieldstone.example"],
  ] },
  { org: "Bayou City Lending Co", rows: [
    ["Administrator", "bayoucity.admin@fieldstone.example"],
    ["Manager", "bayoucity.manager@fieldstone.example"],
    ["Loan officer", "bayoucity.lo@fieldstone.example"],
  ] },
  { org: "Red Oak Residential Finance", rows: [
    ["Administrator", "redoak.admin@fieldstone.example"],
    ["Manager", "redoak.manager@fieldstone.example"],
    ["Loan officer", "redoak.lo@fieldstone.example"],
  ] },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-7 rounded-md bg-(--accent)"
            style={{ maskImage: "none" }}
          />
          <span className="text-sm font-semibold tracking-tight">
            Fieldstone Lending Network
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Sign in to your seat
        </h1>
        <p className="text-sm text-muted text-pretty">
          Each seat allows one live session. Signing in here moves the seat to
          this device and ends the session on the last one.
        </p>
      </header>

      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <SignInForm />
      </div>

      <details className="rounded-card border border-line bg-surface/60 p-4 text-sm">
        <summary className="cursor-pointer font-medium select-none">
          Demo seats
        </summary>
        <p className="mt-2 text-muted text-pretty">
          Nine seats across three lender organisations. The password is the
          same for all nine and is handed out by the owner of this
          environment.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {DEMO_SEATS.map((group) => (
            <div key={group.org}>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                {group.org}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {group.rows.map(([role, email]) => (
                  <li key={email} className="flex flex-wrap justify-between gap-x-3">
                    <span className="text-muted">{role}</span>
                    <span className="font-mono text-xs">{email}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}
