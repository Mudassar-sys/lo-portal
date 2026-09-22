import Link from "next/link";
import { getPortalContext } from "@/lib/portal";
import { ROLE_LABELS } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/borrowers", label: "Borrowers" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/property-intelligence", label: "Property intelligence" },
  { href: "/sessions", label: "Sessions" },
] as const;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org, seat, claims } = await getPortalContext();

  return (
    // The tenant's accent is applied here, from the tenant's own record, so
    // the white labelling is visible on first paint rather than after a
    // client side fetch.
    <div
      style={{ "--accent": org.accent_color } as React.CSSProperties}
      className="min-h-dvh"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="size-7 shrink-0 rounded-md bg-(--accent)" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {org.display_name}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="truncate">on Fieldstone Lending Network</span>
                {org.premium ? (
                  <span className="rounded border border-(--accent)/40 px-1 py-px text-[10px] font-medium text-(--accent)">
                    Premium
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-muted
                           transition-colors duration-150 hover:bg-raised hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight">{seat.label}</p>
              <p className="text-xs text-muted">{ROLE_LABELS[claims.orgRole]}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-sm
                           transition-colors duration-150 hover:bg-raised"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
