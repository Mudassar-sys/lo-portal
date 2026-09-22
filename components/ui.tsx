import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** A surface. Everything sits on one of these, so they are all the same. */
export function Card({
  children,
  className = "",
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted text-pretty">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: "border-line text-muted",
  accent: "border-(--accent)/40 text-(--accent)",
  ok: "border-ok/40 text-ok",
  warn: "border-warn/40 text-warn",
  bad: "border-bad/40 text-bad",
  info: "border-info/40 text-info",
} as const;

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const BUTTON_BASE =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium " +
  "transition-[opacity,background-color] duration-150 focus-visible:outline-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const buttonClass = {
  primary: `${BUTTON_BASE} bg-(--accent) text-(--accent-ink) hover:opacity-90`,
  secondary: `${BUTTON_BASE} border border-line hover:bg-raised`,
  quiet: `${BUTTON_BASE} text-muted hover:bg-raised hover:text-ink`,
};

export function ButtonLink({
  href,
  variant = "secondary",
  children,
}: {
  href: ComponentProps<typeof Link>["href"];
  variant?: keyof typeof buttonClass;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass[variant]}>
      {children}
    </Link>
  );
}

/**
 * An empty state always offers exactly one thing to do. A dead end with an
 * apology on it is not a state, it is a bug someone decided to keep.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden
        className="size-10 rounded-full border border-dashed border-line"
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">{body}</p>
      </div>
      {action}
    </div>
  );
}

/** Grey blocks with a pulse, sized like the rows they stand in for. */
export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="animate-pulse divide-y divide-line/60">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-3.5 w-40 rounded bg-raised" />
          <div className="hidden h-3.5 w-56 rounded bg-raised sm:block" />
          <div className="ml-auto h-3.5 w-20 rounded bg-raised" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-raised ${className}`} />;
}

/** A label above a value. Used wherever a record is shown as facts. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}
