"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { advanceSubmission, assignSubmission } from "./actions";
import { ACTION_LABEL, NEXT_STATUS, STATUS_LABEL } from "@/lib/submissions";
import { Chip, buttonClass } from "@/components/ui";
import { money } from "@/lib/scenarios";

export interface QueueRow {
  id: string;
  status: string;
  assigned_seat: string | null;
  created_at: string;
  scenario_id: string;
  property_address: string;
  loan_amount: string;
  borrower: string;
}

const TONE: Record<string, "neutral" | "info" | "warn" | "ok" | "bad"> = {
  draft: "neutral",
  submitted: "info",
  in_review: "warn",
  approved: "ok",
  declined: "bad",
};

export function SubmissionQueue({
  rows,
  seats,
  canManage,
}: {
  rows: QueueRow[];
  seats: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ error: string | null; message: string | null }>({
    error: null,
    message: null,
  });

  const act = (run: () => Promise<{ error: string | null; message: string | null }>) =>
    startTransition(async () => {
      setNote(await run());
    });

  return (
    <div className="flex flex-col gap-3">
      {note.error ? (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {note.error}
        </p>
      ) : null}
      {note.message ? (
        <p role="status" className="text-sm text-ok">
          {note.message}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const next = NEXT_STATUS[row.status] ?? [];
          return (
            <li
              key={row.id}
              className="rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-line"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/scenarios/${row.scenario_id}`}
                    className="font-medium hover:text-(--accent)"
                  >
                    {row.property_address}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted">
                    {row.borrower} . {money(row.loan_amount)}
                  </p>
                </div>
                <Chip tone={TONE[row.status] ?? "neutral"}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Assigned</span>
                  <select
                    defaultValue={row.assigned_seat ?? ""}
                    disabled={!canManage || pending}
                    onChange={(event) =>
                      act(() => assignSubmission(row.id, event.target.value || null))
                    }
                    className="h-8 rounded-lg border border-line bg-raised px-2 text-sm
                               focus:border-(--accent) focus:outline-none disabled:opacity-60"
                  >
                    <option value="">nobody</option>
                    {seats.map((seat) => (
                      <option key={seat.id} value={seat.id}>
                        {seat.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="ml-auto flex flex-wrap gap-2">
                  {next.length === 0 ? (
                    <span className="text-xs text-muted">This one is finished.</span>
                  ) : (
                    next.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={!canManage || pending}
                        onClick={() => act(() => advanceSubmission(row.id, status))}
                        className={status === "declined" ? buttonClass.secondary : buttonClass.primary}
                      >
                        {ACTION_LABEL[status] ?? status}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {!canManage ? (
                <p className="mt-2 text-xs text-muted">
                  A loan officer can raise a submission and watch it. Moving it and
                  reassigning it belong to a manager, and the database refuses the write
                  rather than the button being hidden.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
