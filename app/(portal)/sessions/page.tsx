import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";
import { ROLE_LABELS } from "@/lib/auth";
import type { Seat } from "@/lib/portal";
import { SignOutOthers } from "./sign-out-others";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const { claims, org } = await getPortalContext();
  const supabase = await createClient();

  // No org filter here either. The roster is whatever the policies return,
  // which is this organisation's three seats.
  const { data } = await supabase
    .from("seats")
    .select("id, org_id, label, role, login_email, user_id, active_session_id, is_demo_admin, created_at")
    .order("role")
    .order("label")
    .returns<Seat[]>();

  const seats = data ?? [];
  const occupied = seats.filter((s) => s.active_session_id).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted text-pretty">
          {org.display_name} holds {seats.length} named seats and{" "}
          {occupied === 1 ? "1 is" : `${occupied} are`} in use. A seat allows
          one live session. Signing in on another device moves the seat there,
          and the device that lost it is refused its next token.
        </p>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="px-4 py-2.5 font-medium">Seat</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Active session</th>
              <th scope="col" className="px-4 py-2.5 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => {
              const isThisSession =
                claims.sessionId !== null &&
                seat.active_session_id === claims.sessionId;

              return (
                <tr
                  key={seat.id}
                  className="border-b border-line/60 last:border-0 hover:bg-raised/50"
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {seat.label}
                    {seat.is_demo_admin ? (
                      <span className="ml-2 rounded border border-warn/40 px-1.5 py-0.5 text-[11px] text-warn">
                        demo admin
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {ROLE_LABELS[seat.role]}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {seat.login_email ?? "not assigned"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {seat.active_session_id ? (
                      <span title={seat.active_session_id}>
                        {seat.active_session_id.slice(0, 8)}
                        <span className="text-muted">
                          {seat.active_session_id.slice(8, 13)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">none</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isThisSession ? (
                      <span className="text-ok">this device</span>
                    ) : seat.active_session_id ? (
                      <span className="text-warn">in use elsewhere</span>
                    ) : (
                      <span className="text-muted">free</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-medium">This account</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Session</dt>
          <dd className="font-mono text-xs break-all">
            {claims.sessionId ?? "unknown"}
          </dd>
          <dt className="text-muted">Seat</dt>
          <dd className="font-mono text-xs break-all">{claims.seatId}</dd>
          <dt className="text-muted">Organisation</dt>
          <dd className="font-mono text-xs break-all">{claims.orgId}</dd>
          <dt className="text-muted">Role claim</dt>
          <dd className="font-mono text-xs">{claims.orgRole}</dd>
        </dl>
        <p className="mt-4 max-w-2xl text-sm text-muted text-pretty">
          These four values are read out of the signed token, not out of the
          page or a cookie the browser could edit. They are what every policy
          in the database compares against.
        </p>
        <div className="mt-4">
          <SignOutOthers />
        </div>
      </div>
    </div>
  );
}
