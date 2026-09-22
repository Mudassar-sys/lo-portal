import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClaims } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ScenarioBuilder } from "./builder";

export const metadata: Metadata = { title: "New scenario" };

export default async function NewScenarioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireClaims();
  const params = await searchParams;
  const borrower = typeof params.borrower === "string" ? params.borrower : undefined;

  const supabase = await createClient();
  const { data } = await supabase
    .from("borrowers")
    .select("id, first_name, last_name")
    .order("last_name")
    .order("first_name")
    .returns<Array<{ id: string; first_name: string; last_name: string }>>();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/scenarios" className="text-sm text-muted hover:text-ink">
          Scenarios
        </Link>
        <PageHeader
          title="New financing scenario"
          description="The panel is matched on what this file actually is. Lenders that cannot take it say why, and what would change their answer."
        />
      </div>
      <ScenarioBuilder borrowers={data ?? []} preselected={borrower} />
    </div>
  );
}
