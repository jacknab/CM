/**
 * The longest a free trial can run (owner's rule, 2026-10-17): the 60-day trial plus at most one 14-day
 * extension — 74 days from the day it started. Support (/isTeam) and admin extensions are refused past that.
 */
import { pool } from "../db";

export const MAX_TRIAL_EXTENSION_DAYS = 14;
export const MAX_TRIAL_TOTAL_DAYS = 74;
const DAY_MS = 86_400_000;

/** The latest date this owner's trial may end: 74 days after it started (account creation when no start is recorded). */
export async function latestTrialEnd(userId: string): Promise<Date | null> {
  const { rows } = await pool.query(`SELECT COALESCE(trial_started_at, created_at) AS started FROM users WHERE id = $1`, [userId]);
  if (!rows[0]?.started) return null;
  return new Date(new Date(rows[0].started).getTime() + MAX_TRIAL_TOTAL_DAYS * DAY_MS);
}

/** Why a new trial end isn't allowed, or null when it is. */
export function trialEndRefusal(newEnd: Date, latest: Date | null): string | null {
  if (!latest || newEnd.getTime() <= latest.getTime()) return null;
  return `A free trial can run at most ${MAX_TRIAL_TOTAL_DAYS} days (60 days plus one ${MAX_TRIAL_EXTENSION_DAYS}-day extension). `
    + `This account's trial can't end later than ${latest.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;
}
