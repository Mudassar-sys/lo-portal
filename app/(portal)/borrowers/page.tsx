import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import {
  PAGE_SIZE,
  SOURCE_LABELS,
  sanitizeSearch,
  type Borrower,
  type BorrowerSource,
} from "@/lib/borrowers";
import { Card, Chip, EmptyState, ButtonLink, PageHeader, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Borrowers" };

const SOURCES: Array<{ value: BorrowerSource | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "manual", label: "By hand" },
  { value: "csv", label: "Imported" },
  { value: "intake", label: "Intake" },
];

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function href(params: { q?: string; source?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.source && params.source !== "all") search.set("source", params.source);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return (query ? `/borrowers?${query}` : "/borrowers") as "/borrowers";
}

export default async function BorrowersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The proxy already redirected a signed out visitor, but a server component
  // verifies for itself rather than trusting that.
  await requireClaims();

  const params = await searchParams;
  const rawQuery = typeof params.q === "string" ? params.q : "";
  const query = sanitizeSearch(rawQuery);
  const source = typeof params.source === "string" ? params.source : "all";
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  const supabase = await createClient();

  // Note what is absent: there is no .eq("org_id", ...) here, and there is no
  // org id in this file at all. The tenant boundary is the database's job. If
  // it were this query's job, one forgotten filter would be a data breach, and
  // there is no way to see a forgotten filter in a diff.
  let request = supabase
    .from("borrowers")
    .select("id, org_id, first_name, last_name, email, phone, source, created_by_seat, created_at", {
      count: "exact",
    })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (source !== "all" && ["manual", "csv", "intake"].includes(source)) {
    request = request.eq("source", source);
  }

  if (query) {
    // The term is sanitised in lib/borrowers because PostgREST treats this
    // string as filter syntax, not as a value.
    const like = `%${query}%`;
    request = request.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await request
    .range(from, from + PAGE_SIZE - 1)
    .returns<Borrower[]>();

  const borrowers = data ?? [];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(query) || source !== "all";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Borrowers"
        description="Every borrower this organisation holds. The list is what the database returns for your seat, not a filtered copy of everyone's."
        actions={<ButtonLink href="/borrowers/import" variant="primary">Import CSV</ButtonLink>}
      />

      <Card className="overflow-hidden">
        {/* Stacked below 640px. Sharing one row there squeezes the search
            field to nothing and pushes the filters under the button. */}
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <form method="get" className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
            <input
              type="search"
              name="q"
              defaultValue={rawQuery}
              placeholder="Search name, email or phone"
              aria-label="Search borrowers"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-sm
                         placeholder:text-muted/70 transition-colors duration-150
                         focus:border-(--accent) focus:outline-none sm:max-w-xs"
            />
            {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
            <button type="submit" className={buttonClass.secondary}>
              Search
            </button>
          </form>

          <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
            {SOURCES.map((option) => {
              const active = source === option.value;
              return (
                <Link
                  key={option.value}
                  href={href({ q: rawQuery, source: option.value })}
                  aria-current={active ? "true" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors duration-150 ${
                    active
                      ? "bg-(--accent)/15 text-(--accent)"
                      : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        {error ? (
          <EmptyState
            title="That list could not be loaded"
            body={error.message}
            action={<ButtonLink href="/borrowers">Start again</ButtonLink>}
          />
        ) : borrowers.length === 0 ? (
          filtered ? (
            <EmptyState
              title="Nothing matches that"
              body="No borrower in this organisation matches the search and filter you have set."
              action={<ButtonLink href="/borrowers">Clear the filters</ButtonLink>}
            />
          ) : (
            <EmptyState
              title="No borrowers yet"
              body="Import a CSV of your existing book and the profiles land here, with a per row report of anything that did not fit."
              action={
                <ButtonLink href="/borrowers/import" variant="primary">
                  Import CSV
                </ButtonLink>
              }
            />
          )
        ) : (
          <>
            {/* Below 640px a table is unreadable, so the same rows become a list. */}
            <ul className="divide-y divide-line/60 sm:hidden">
              {borrowers.map((borrower) => (
                <li key={borrower.id}>
                  <Link
                    href={`/borrowers/${borrower.id}`}
                    className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-raised/60"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {borrower.last_name}, {borrower.first_name}
                      </span>
                      <Chip tone={borrower.source === "intake" ? "info" : "neutral"}>
                        {SOURCE_LABELS[borrower.source]}
                      </Chip>
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {borrower.email ?? borrower.phone ?? "no contact details"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Phone</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.map((borrower) => (
                  <tr
                    key={borrower.id}
                    className="border-b border-line/60 last:border-0 transition-colors duration-150 hover:bg-raised/50"
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/borrowers/${borrower.id}`}
                        className="rounded hover:text-(--accent) focus-visible:outline-2"
                      >
                        {borrower.last_name}, {borrower.first_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {borrower.email ?? "not given"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                      {borrower.phone ?? "not given"}
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={borrower.source === "intake" ? "info" : "neutral"}>
                        {SOURCE_LABELS[borrower.source]}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {dateFormat.format(new Date(borrower.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
              <p className="text-muted">
                {total === 1 ? "1 borrower" : `${total} borrowers`}
                {filtered ? " matching" : ""}
                {total > PAGE_SIZE ? `, showing ${from + 1} to ${Math.min(from + PAGE_SIZE, total)}` : ""}
              </p>
              {lastPage > 1 ? (
                <div className="flex items-center gap-1">
                  {page > 1 ? (
                    <Link href={href({ q: rawQuery, source, page: page - 1 })} className={buttonClass.secondary}>
                      Previous
                    </Link>
                  ) : (
                    <span className={`${buttonClass.secondary} pointer-events-none opacity-40`}>Previous</span>
                  )}
                  <span className="px-2 text-muted tabular-nums">
                    {page} of {lastPage}
                  </span>
                  {page < lastPage ? (
                    <Link href={href({ q: rawQuery, source, page: page + 1 })} className={buttonClass.secondary}>
                      Next
                    </Link>
                  ) : (
                    <span className={`${buttonClass.secondary} pointer-events-none opacity-40`}>Next</span>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
