export type BorrowerSource = "manual" | "csv" | "intake";

export interface Borrower {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: BorrowerSource;
  created_by_seat: string | null;
  created_at: string;
}

export const SOURCE_LABELS: Record<BorrowerSource, string> = {
  manual: "Added by hand",
  csv: "Imported",
  intake: "Intake form",
};

export const PAGE_SIZE = 25;

/**
 * Rows per server action call.
 *
 * A server action request body is capped at 1 MB by default, and the platform
 * caps a request at 4.5 MB, so a large file is posted in batches rather than
 * in one go. This lives here rather than beside the actions because a module
 * marked "use server" may only export async functions.
 */
export const BATCH_SIZE = 500;

export interface BatchResult {
  inserted: number;
  duplicates: number[];
  failed: number;
  error: string | null;
}

/**
 * PostgREST reads an `or` filter as syntax, not as a value. The reference is
 * explicit that the string "is used as-is" and "needs to be properly
 * sanitized", so a comma or a bracket typed into the search box would change
 * the shape of the filter rather than be searched for.
 *
 * Everything that can terminate, nest or negate a filter is removed, and the
 * wildcard is stripped so a search for "%" does not turn into match anything.
 * What remains is matched case insensitively as a substring.
 */
export function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()"'\\*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Lower case and trimmed, so two spellings of one address collide. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length ? email : null;
}

/**
 * Digits only, and a leading 1 dropped for eleven digit North American
 * numbers, so "713-555-0134", "(713) 555 0134" and "+1 713 555 0134" are one
 * number rather than three.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

// Deliberately permissive. This is an import of somebody else's spreadsheet,
// not a signup form, and rejecting an unusual but real address helps nobody.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CsvRow {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface RowProblem {
  line: number;
  field: string;
  value: string;
  problem: string;
}

/** Header spellings the importer accepts, mapped to the field they mean. */
const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  firstname: "first_name",
  first: "first_name",
  givenname: "first_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  familyname: "last_name",
  email: "email",
  emailaddress: "email",
  mail: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  cell: "phone",
  telephone: "phone",
  tel: "phone",
};

/** "First Name", "first_name" and "FIRSTNAME" all arrive here as first_name. */
export function canonicalHeader(header: string): string {
  const key = header.toLowerCase().replace(/[^a-z]/g, "");
  return HEADER_ALIASES[key] ?? key;
}

/**
 * Validate one parsed row.
 *
 * `line` is the line in the file the person can actually find, counting the
 * header, so the error list matches what they see in their spreadsheet.
 */
export function validateRow(
  raw: Record<string, string | undefined>,
  line: number
): { row: CsvRow | null; problems: RowProblem[] } {
  const problems: RowProblem[] = [];

  const first = String(raw.first_name ?? "").trim();
  const last = String(raw.last_name ?? "").trim();
  const emailRaw = String(raw.email ?? "").trim();
  const phoneRaw = String(raw.phone ?? "").trim();

  if (!first) {
    problems.push({ line, field: "first_name", value: "", problem: "First name is missing" });
  }
  if (!last) {
    problems.push({ line, field: "last_name", value: "", problem: "Last name is missing" });
  }
  if (emailRaw && !EMAIL.test(emailRaw)) {
    problems.push({ line, field: "email", value: emailRaw, problem: "Not an email address" });
  }
  if (phoneRaw && (normalizePhone(phoneRaw) ?? "").length < 7) {
    problems.push({ line, field: "phone", value: phoneRaw, problem: "Too few digits for a phone number" });
  }
  if (!emailRaw && !phoneRaw) {
    problems.push({
      line,
      field: "email",
      value: "",
      problem: "A row needs an email address or a phone number to be reachable",
    });
  }

  if (problems.length) return { row: null, problems };

  return {
    row: {
      first_name: first,
      last_name: last,
      email: emailRaw ? emailRaw : null,
      phone: phoneRaw ? phoneRaw : null,
    },
    problems: [],
  };
}

/** The key two rows collide on: the email if there is one, otherwise the phone. */
export function duplicateKey(row: {
  email: string | null;
  phone: string | null;
}): string | null {
  const email = normalizeEmail(row.email);
  if (email) return `e:${email}`;
  const phone = normalizePhone(row.phone);
  if (phone) return `p:${phone}`;
  return null;
}

export function problemsToCsv(problems: RowProblem[]): string {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  return [
    "line,field,value,problem",
    ...problems.map((p) =>
      [p.line, p.field, escape(p.value), escape(p.problem)].join(",")
    ),
  ].join("\n");
}
