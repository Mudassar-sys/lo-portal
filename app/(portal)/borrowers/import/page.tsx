import type { Metadata } from "next";
import Link from "next/link";
import { requireClaims } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import borrowers" };

export default async function ImportPage() {
  await requireClaims();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/borrowers" className="text-sm text-muted hover:text-ink">
          Borrowers
        </Link>
        <PageHeader
          title="Import borrowers"
          description="The file is read in your browser, checked row by row, and shown to you before anything is written. Rows this organisation already holds are skipped rather than duplicated."
        />
      </div>
      <ImportClient />
    </div>
  );
}
