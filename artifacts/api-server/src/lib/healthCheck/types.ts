import type { Pool } from "pg";

export interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  action?: string;
  ownerVisible?: boolean;
}

export interface SegmentResult {
  segmentId: string;
  label: string;
  status: "pass" | "warn" | "fail";
  runAt: string;
  checks: CheckResult[];
  tables?: Record<string, unknown[]>;
}

export type SegmentRunner = (accountId: number, pool: Pool) => Promise<SegmentResult>;

export function rollup(checks: CheckResult[]): "pass" | "warn" | "fail" {
  if (checks.some(c => c.status === "fail")) return "fail";
  if (checks.some(c => c.status === "warn")) return "warn";
  return "pass";
}

export function pass(id: string, label: string, detail?: string, ownerVisible = true): CheckResult {
  return { id, label, status: "pass", detail, ownerVisible };
}

export function warn(id: string, label: string, detail: string, action?: string, ownerVisible = true): CheckResult {
  return { id, label, status: "warn", detail, action, ownerVisible };
}

export function fail(id: string, label: string, detail: string, action?: string, ownerVisible = true): CheckResult {
  return { id, label, status: "fail", detail, action, ownerVisible };
}

export const SEGMENT_IDS = [
  "booking_readiness",
  "team_roster",
  "services_catalog",
  "features_settings",
  "commission_payroll",
  "sms_communications",
  "payments_billing",
  "ai_receptionist",
  "online_presence",
  "kiosk_waitlist",
] as const;

export type SegmentId = typeof SEGMENT_IDS[number];
