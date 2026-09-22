"use client";

import { useActionState, useMemo, useState } from "react";
import { createScenario, type ScenarioFormState } from "../actions";
import { CREDIT_BANDS, LOAN_PURPOSES, money, percent } from "@/lib/scenarios";
import { Card, buttonClass } from "@/components/ui";

const initial: ScenarioFormState = { error: null };

const FIELD =
  "h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm transition-colors " +
  "duration-150 placeholder:text-muted/70 focus:border-(--accent) focus:outline-none";

export function ScenarioBuilder({
  borrowers,
  preselected,
}: {
  borrowers: Array<{ id: string; first_name: string; last_name: string }>;
  preselected?: string;
}) {
  const [state, formAction, pending] = useActionState(createScenario, initial);
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");

  // The two numbers the lender actually cares about, worked out as the person
  // types rather than after they submit.
  const derived = useMemo(() => {
    const p = Number(price.replace(/[^0-9.]/g, ""));
    const d = Number(deposit.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(p) || p <= 0) return null;
    if (!Number.isFinite(d) || d < 0 || d >= p) return null;
    const loan = p - d;
    return { loan, ltv: (loan / p) * 100, depositPct: (d / p) * 100 };
  }, [price, deposit]);

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-3">
      <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Borrower</span>
          <select name="borrower_id" defaultValue={preselected ?? ""} required className={FIELD}>
            <option value="" disabled>
              Choose a borrower
            </option>
            {borrowers.map((borrower) => (
              <option key={borrower.id} value={borrower.id}>
                {borrower.last_name}, {borrower.first_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Property address</span>
          <input
            name="property_address"
            required
            placeholder="2118 Westheimer Rd, Houston, TX 77098"
            className={FIELD}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Purchase price</span>
            <input
              name="purchase_price"
              inputMode="decimal"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="415,000"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Deposit</span>
            <input
              name="down_payment"
              inputMode="decimal"
              required
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              placeholder="83,000"
              className={FIELD}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Credit band</span>
            <select name="credit_band" defaultValue="740+" className={FIELD}>
              {CREDIT_BANDS.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">What the loan is for</span>
            <select name="loan_purpose" defaultValue="purchase" className={FIELD}>
              {LOAN_PURPOSES.map((purpose) => (
                <option key={purpose.value} value={purpose.value}>
                  {purpose.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {state.error ? (
          <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {state.error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass.primary}>
            {pending ? "Matching" : "Find lenders"}
          </button>
          <span className="text-sm text-muted">Nothing is sent to a lender.</span>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <h2 className="font-medium">The ask</h2>
        {derived ? (
          <dl className="mt-4 flex flex-col gap-4">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">Loan amount</dt>
              <dd className="mt-0.5 font-mono text-2xl tabular-nums">{money(derived.loan)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">
                Loan to value
              </dt>
              <dd className="mt-0.5 font-mono text-2xl tabular-nums">{percent(derived.ltv)}</dd>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full bg-(--accent)"
                  style={{ width: `${Math.min(100, derived.ltv)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Deposit is {percent(derived.depositPct)} of the price.
              </p>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted text-pretty">
            Enter a price and a deposit and the loan, the loan to value and the deposit
            share appear here before you run anything.
          </p>
        )}
      </Card>
    </form>
  );
}
