"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import {
  BATCH_SIZE,
  canonicalHeader,
  duplicateKey,
  problemsToCsv,
  validateRow,
  type CsvRow,
  type RowProblem,
} from "@/lib/borrowers";
import { analyzeBatch, importBatch } from "./actions";
import { Card, Chip, buttonClass } from "@/components/ui";

type Stage = "choose" | "parsing" | "preview" | "importing" | "done";

interface Candidate {
  line: number;
  row: CsvRow;
  duplicate: "file" | "existing" | null;
}

interface Summary {
  inserted: number;
  skipped: number;
  failed: number;
  error: string | null;
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export function ImportClient() {
  const [stage, setStage] = useState<Stage>("choose");
  const [fileName, setFileName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [problems, setProblems] = useState<RowProblem[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const dupInFile = candidates.filter((c) => c.duplicate === "file").length;
    const dupExisting = candidates.filter((c) => c.duplicate === "existing").length;
    return {
      ready: candidates.filter((c) => c.duplicate === null).length,
      dupInFile,
      dupExisting,
      problems: problems.length,
      badLines: new Set(problems.map((p) => p.line)).size,
    };
  }, [candidates, problems]);

  const reset = () => {
    setStage("choose");
    setFileName("");
    setCandidates([]);
    setProblems([]);
    setProgress({ done: 0, total: 0 });
    setSummary(null);
    setFatal(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = useCallback((file: File) => {
    setFatal(null);
    setFileName(file.name);
    setStage("parsing");

    // worker: true keeps the page responsive on a large file, which is the
    // documented purpose of the option. skipEmptyLines: "greedy" drops rows
    // that are only whitespace, because a trailing comma is not worth an
    // error line.
    //
    // transformHeader is deliberately NOT used here even though it would fit:
    // worker mode posts the config to the worker, a function cannot be
    // structured cloned, and the parse dies with "could not be cloned". The
    // headers are canonicalised below instead, on rows that have already
    // crossed back.
    Papa.parse<Record<string, string>>(file, {
      header: true,
      worker: true,
      skipEmptyLines: "greedy",
      complete: async (results) => {
        const found: Candidate[] = [];
        const allProblems: RowProblem[] = [];
        const seenInFile = new Set<string>();

        results.data.forEach((rawRow, index) => {
          // "First Name", "first_name" and "FIRSTNAME" all become first_name.
          const raw: Record<string, string> = {};
          for (const [key, value] of Object.entries(rawRow)) {
            raw[canonicalHeader(key)] = value;
          }

          // +2: one for the header row, one because a spreadsheet counts from 1.
          const line = index + 2;
          const { row, problems: rowProblems } = validateRow(raw, line);
          if (!row) {
            allProblems.push(...rowProblems);
            return;
          }
          const key = duplicateKey(row);
          const inFile = key !== null && seenInFile.has(key);
          if (key) seenInFile.add(key);
          found.push({ line, row, duplicate: inFile ? "file" : null });
        });

        for (const error of results.errors ?? []) {
          allProblems.push({
            line: (error.row ?? 0) + 2,
            field: "file",
            value: error.code ?? "",
            problem: error.message,
          });
        }

        setProblems(allProblems);

        // Ask the server which of these it already holds. The rows go in
        // batches because a server action body is capped at 1 MB.
        try {
          const batches = chunk(found, BATCH_SIZE);
          let offset = 0;
          for (const batch of batches) {
            const result = await analyzeBatch(batch.map((c) => c.row));
            for (const index of result.duplicates) {
              const candidate = found[offset + index];
              if (candidate && candidate.duplicate === null) candidate.duplicate = "existing";
            }
            offset += batch.length;
          }
        } catch (error) {
          setFatal(error instanceof Error ? error.message : "The preview could not be built.");
        }

        setCandidates(found);
        setStage("preview");
      },
      error: (error) => {
        setFatal(error.message);
        setStage("choose");
      },
    });
  }, []);

  const commit = async () => {
    const ready = candidates.filter((c) => c.duplicate === null).map((c) => c.row);
    const batches = chunk(ready, BATCH_SIZE);
    setStage("importing");
    setProgress({ done: 0, total: ready.length });

    let inserted = 0;
    let skipped = candidates.length - ready.length;
    let failed = 0;
    let error: string | null = null;

    for (const batch of batches) {
      const result = await importBatch(batch);
      inserted += result.inserted;
      skipped += result.duplicates.length;
      failed += result.failed;
      if (result.error) error = result.error;
      setProgress((p) => ({ ...p, done: p.done + batch.length }));
      if (result.error) break;
    }

    setSummary({ inserted, skipped, failed, error });
    setStage("done");
  };

  const downloadProblems = () => {
    const blob = new Blob([problemsToCsv(problems)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.csv$/i, "") || "import"}-errors.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {fatal ? (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {fatal}
        </p>
      ) : null}

      {stage === "choose" || stage === "parsing" ? (
        <Card className="p-6">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center transition-colors duration-150 hover:border-(--accent)/60">
            <span aria-hidden className="size-10 rounded-full border border-dashed border-line" />
            <span className="font-medium">
              {stage === "parsing" ? `Reading ${fileName}` : "Choose a CSV file"}
            </span>
            <span className="max-w-md text-sm text-muted text-pretty">
              The first row is the header. First name and last name are required, and each
              row needs an email address or a phone number. Columns may be called First
              Name, first_name or FIRSTNAME.
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={stage === "parsing"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
            />
            <span className={buttonClass.primary} aria-hidden>
              {stage === "parsing" ? "Reading" : "Select file"}
            </span>
          </label>
        </Card>
      ) : null}

      {stage === "preview" ? (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">{fileName}</h2>
                <p className="mt-0.5 text-sm text-muted">
                  Nothing has been written yet. This is what would happen.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={reset} className={buttonClass.secondary}>
                  Choose another file
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={counts.ready === 0}
                  className={buttonClass.primary}
                >
                  Import {counts.ready} {counts.ready === 1 ? "borrower" : "borrowers"}
                </button>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* The colour classes are written out rather than built from a
                  variable. Tailwind extracts class names statically, so a
                  template literal like text-${tone} only ever works by
                  accident, when some other file happens to use the same
                  class. */}
              {[
                { label: "Ready", value: counts.ready, className: "text-ok" },
                { label: "Already held", value: counts.dupExisting, className: "text-warn" },
                { label: "Repeated in file", value: counts.dupInFile, className: "text-warn" },
                { label: "Rows with errors", value: counts.badLines, className: "text-bad" },
              ].map((tile) => (
                <div key={tile.label} className="rounded-lg border border-line bg-raised/50 p-3">
                  <dt className="text-xs font-medium tracking-wide text-muted uppercase">
                    {tile.label}
                  </dt>
                  <dd
                    className={`mt-1 font-mono text-2xl tabular-nums ${
                      tile.value > 0 ? tile.className : "text-muted"
                    }`}
                  >
                    {tile.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {problems.length ? (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-medium">Rows that will not be imported</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Numbered by the line in your file, so they can be found and fixed.
                  </p>
                </div>
                <button type="button" onClick={downloadProblems} className={buttonClass.secondary}>
                  Download the error list
                </button>
              </div>
              <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto">
                {problems.slice(0, 200).map((problem, index) => (
                  <li
                    key={`${problem.line}-${problem.field}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-muted">line {problem.line}</span>
                    <Chip tone="bad">{problem.field}</Chip>
                    <span>{problem.problem}</span>
                    {problem.value ? (
                      <span className="font-mono text-xs text-muted">{problem.value}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {problems.length > 200 ? (
                <p className="border-t border-line px-4 py-2 text-xs text-muted">
                  Showing the first 200. The download has all {problems.length}.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-medium">Preview</h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="px-4 py-2.5 font-medium">Line</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Phone</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.slice(0, 100).map((candidate) => (
                    <tr key={candidate.line} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted">{candidate.line}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {candidate.row.last_name}, {candidate.row.first_name}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted">
                        {candidate.row.email ?? "not given"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted whitespace-nowrap">
                        {candidate.row.phone ?? "not given"}
                      </td>
                      <td className="px-4 py-2">
                        {candidate.duplicate === "existing" ? (
                          <Chip tone="warn">already held</Chip>
                        ) : candidate.duplicate === "file" ? (
                          <Chip tone="warn">repeated in file</Chip>
                        ) : (
                          <Chip tone="ok">will be added</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {candidates.length > 100 ? (
              <p className="border-t border-line px-4 py-2 text-xs text-muted">
                Showing the first 100 of {candidates.length}.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      {stage === "importing" ? (
        <Card className="p-6">
          <p className="font-medium">Importing {progress.total} borrowers</p>
          <p className="mt-1 text-sm text-muted">
            Sent in batches of {BATCH_SIZE}, because a server action body is capped at 1 MB.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full bg-(--accent) transition-[width] duration-200"
              style={{
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-muted tabular-nums">
            {progress.done} of {progress.total}
          </p>
        </Card>
      ) : null}

      {stage === "done" && summary ? (
        <Card className="p-6">
          <h2 className="font-medium">Import finished</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-line bg-raised/50 p-3">
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">Inserted</dt>
              <dd className="mt-1 font-mono text-2xl tabular-nums text-ok">{summary.inserted}</dd>
            </div>
            <div className="rounded-lg border border-line bg-raised/50 p-3">
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">Skipped</dt>
              <dd className="mt-1 font-mono text-2xl tabular-nums">{summary.skipped}</dd>
            </div>
            <div className="rounded-lg border border-line bg-raised/50 p-3">
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">Failed</dt>
              <dd
                className={`mt-1 font-mono text-2xl tabular-nums ${summary.failed ? "text-bad" : ""}`}
              >
                {summary.failed}
              </dd>
            </div>
          </dl>
          {summary.error ? (
            <p role="alert" className="mt-3 text-sm text-bad">
              {summary.error}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted text-pretty">
            Skipped rows are the ones this organisation already held, or that the file
            repeated. Nothing was overwritten.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/borrowers" className={buttonClass.primary}>
              See the borrowers
            </Link>
            <button type="button" onClick={reset} className={buttonClass.secondary}>
              Import another file
            </button>
            {problems.length ? (
              <button type="button" onClick={downloadProblems} className={buttonClass.secondary}>
                Download the error list
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
