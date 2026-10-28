/**
 * Manager → Service Times: how long services really take (START to DONE, or to checkout), against the time
 * planned for them — per technician and per service (owner, 2026-10-21). Read-only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchServiceTimes, type ServiceTimeRow } from "./nailApi";
import { formatDuration } from "./ticketDraft";
import { techLabel } from "./techName";

const PERIODS = [{ days: 1, label: "Today" }, { days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];

function Table({ title, rows, testId }: { title: string; rows: ServiceTimeRow[]; testId: string }) {
  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="assign-create-status" style={{ fontWeight: 800, letterSpacing: ".06em" }}>{title}</div>
      {rows.length === 0 ? <p className="assign-create-hint">No finished services in this period.</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: .7, fontSize: 11 }}>
              <th style={{ padding: "4px 6px" }}>Name</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Services</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Average</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Planned</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.actual - r.planned;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(127,127,127,.25)" }}>
                  <td style={{ padding: "6px" }}>{r.name}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{r.count}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 700 }}>{formatDuration(r.actual)}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{formatDuration(r.planned)}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 700 }}>
                    {diff === 0 ? "on time" : `${formatDuration(Math.abs(diff))} ${diff > 0 ? "longer" : "shorter"}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ServiceTimesSheet({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(7);
  const { data, isLoading, error } = useQuery({ queryKey: ["/api/nail/service-times", days], queryFn: () => fetchServiceTimes(days) });
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="nail-service-times-title" data-testid="nail-service-times"
        style={{ maxHeight: "90vh", overflowY: "auto", width: "min(760px, 96vw)" }}>
        <div className="assign-create-header">
          <h2 id="nail-service-times-title">Service Times</h2>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="assign-create-hint" style={{ margin: 0 }}>How long services really take, from START to DONE (or to checkout), against the time planned for them.</p>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODS.map((p) => (
              <button key={p.days} type="button" onClick={() => setDays(p.days)} data-testid={`nail-service-times-${p.days}`}
                className={`assign-create-btn ${days === p.days ? "assign-create-btn-ready" : ""}`} style={{ height: 40, padding: "0 14px" }}>{p.label}</button>
            ))}
          </div>
          {isLoading ? <p className="assign-create-hint">Loading…</p>
            : error ? <p className="assign-create-error">{(error as Error).message || "Could not load service times"}</p>
            : data && (<>
              <Table title="BY TECHNICIAN" rows={data.byTech.map((r) => ({ ...r, name: techLabel(r.name, r.id) }))} testId="nail-service-times-tech" />
              <Table title="BY SERVICE (tickets with one service)" rows={data.byService} testId="nail-service-times-service" />
            </>)}
        </div>
      </div>
    </>
  );
}
