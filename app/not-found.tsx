import { RecordNotFound } from "@/components/not-found";

/**
 * The dead end for a URL that matches no route at all.
 *
 * This one renders inside the root layout rather than the portal layout, so it
 * carries the network's own shell rather than a tenant's. That is deliberate:
 * an unmatched URL can be opened with no session, and the page is rendered
 * without reading one. A page that reached for the caller's tenant here would
 * have to become dynamic to do it, and would still have nothing to show a
 * visitor who is not signed in.
 *
 * The heading and the wording are the same as the record level dead end, from
 * the same module, so there is one message rather than three that drift.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-7 rounded-md bg-(--accent)" />
        <span className="font-semibold tracking-tight">Fieldstone Lending Network</span>
      </div>
      <RecordNotFound backHref="/" backLabel="Back to the overview" />
    </div>
  );
}
