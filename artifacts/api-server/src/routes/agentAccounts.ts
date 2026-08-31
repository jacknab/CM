/**
 * Agent Accounts — platform-admin management of /isTeam back-office logins.
 *
 * Lets a platform admin (/isadmin) create support_agents rows that can log
 * in to /isTeam. The agent's login email is auto-generated from their name
 * plus their own row id ({slugified name}{id}@certxa.com) so it can only be
 * computed after the row exists; the admin separately supplies the agent's
 * real email address, which is where the generated login + a freshly
 * generated strong password get emailed.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../db";
import { sendEmail } from "../mail";
import { isAdminAuthenticated } from "../auth";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics after NFKD decomposition
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function generateStrongPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(set.length)];

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));

  // Fisher-Yates shuffle so the required-class characters aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function credentialsEmail(agentName: string, loginEmail: string, password: string) {
  const loginUrl = `${process.env.FRONTEND_URL || process.env.APP_URL || ""}/isTeam/login`;
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Certxa Back Office</h1>
    <p style="color:#a0aec0;margin:6px 0 0">Your team account is ready</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p>Hi ${agentName},</p>
    <p>An account has been created for you on the Certxa back office (/isTeam). Here are your login details:</p>
    <div style="background:#f7fafc;border-left:4px solid #667eea;padding:16px 20px;margin:16px 0;border-radius:0 4px 4px 0">
      <p style="margin:0 0 8px"><strong>Login email:</strong> ${loginEmail}</p>
      <p style="margin:0"><strong>Temporary password:</strong> <span style="font-family:monospace;background:#e9ecef;padding:2px 8px;border-radius:3px">${password}</span></p>
    </div>
    <div style="background:#fff3cd;padding:12px 16px;border-radius:5px;margin:16px 0;border-left:4px solid #ffc107">
      <p style="margin:0;color:#856404"><strong>Important:</strong> Please log in and change your password as soon as possible.</p>
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="${loginUrl}" style="background:#667eea;color:#fff;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block">Log In to Back Office</a>
    </div>
    <p style="margin-top:32px;color:#718096;font-size:13px">Certxa Team</p>
  </div>
</div>`;
  const text = `Hi ${agentName},

An account has been created for you on the Certxa back office (/isTeam).

Login email: ${loginEmail}
Temporary password: ${password}

Please log in and change your password as soon as possible.
Log in at: ${loginUrl}

Certxa Team`;
  return { html, text };
}

interface AgentRow {
  id: number;
  name: string | null;
  email: string | null;
  personal_email: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

function serializeAgent(r: AgentRow) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    personalEmail: r.personal_email,
    role: r.role,
    isActive: r.is_active,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  };
}

// ─── List agent accounts ───────────────────────────────────────────────────────

router.get("/", isAdminAuthenticated, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query<AgentRow>(
      `SELECT id, name, email, personal_email, role, is_active, last_login_at, created_at
       FROM support_agents ORDER BY id DESC`
    );
    res.json(rows.map(serializeAgent));
  } catch (e) {
    console.error("[AgentAccounts] list error:", e);
    res.status(500).json({ error: "Failed to load agent accounts" });
  }
});

// ─── Create an agent account ───────────────────────────────────────────────────

router.post("/", isAdminAuthenticated, async (req: Request, res: Response) => {
  try {
    const { name, personalEmail, role } = req.body as {
      name?: string;
      personalEmail?: string;
      role?: string;
    };

    const trimmedName = String(name ?? "").trim();
    const trimmedPersonalEmail = String(personalEmail ?? "").trim().toLowerCase();
    const agentRole = role === "admin" ? "admin" : "agent";

    if (!trimmedName) {
      return res.status(400).json({ error: "Agent name is required" });
    }
    if (!EMAIL_RE.test(trimmedPersonalEmail)) {
      return res.status(400).json({ error: "A valid email address is required to send credentials to" });
    }

    const [firstName, ...restName] = trimmedName.split(/\s+/);
    const lastName = restName.join(" ");

    const tempPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Insert without the certxa.com login email first — it's derived from the
    // row's own id, so the row must exist before that email can be computed.
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO support_agents (name, first_name, last_name, personal_email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [trimmedName, firstName, lastName || "", trimmedPersonalEmail, passwordHash, agentRole]
    );
    const id = inserted.rows[0].id;
    const loginEmail = `${slugifyName(trimmedName) || "agent"}${id}@certxa.com`;

    const { rows } = await pool.query<AgentRow>(
      `UPDATE support_agents SET email = $1 WHERE id = $2
       RETURNING id, name, email, personal_email, role, is_active, last_login_at, created_at`,
      [loginEmail, id]
    );

    const { html, text } = credentialsEmail(trimmedName, loginEmail, tempPassword);
    const emailResult = await sendEmail(
      1,
      trimmedPersonalEmail,
      "Your Certxa Back Office Login Credentials",
      html,
      text
    );
    if (!emailResult.success) {
      console.error(`[AgentAccounts] Credentials email failed for agent ${id}:`, emailResult.error);
    }

    res.json({
      ...serializeAgent(rows[0]),
      temporaryPassword: tempPassword,
      emailSent: emailResult.success,
      emailError: emailResult.success ? undefined : emailResult.error,
    });
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ error: "An agent account with that login email already exists" });
    }
    console.error("[AgentAccounts] create error:", e);
    res.status(500).json({ error: "Failed to create agent account" });
  }
});

// ─── Activate / deactivate / change role ───────────────────────────────────────

router.patch("/:id", isAdminAuthenticated, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid agent id" });

  const { isActive, role } = req.body as { isActive?: boolean; role?: string };
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (typeof isActive === "boolean") {
    vals.push(isActive);
    sets.push(`is_active = $${vals.length}`);
  }
  if (role === "admin" || role === "agent") {
    vals.push(role);
    sets.push(`role = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

  vals.push(id);
  try {
    const { rows } = await pool.query<AgentRow>(
      `UPDATE support_agents SET ${sets.join(", ")} WHERE id = $${vals.length}
       RETURNING id, name, email, personal_email, role, is_active, last_login_at, created_at`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: "Agent not found" });
    res.json(serializeAgent(rows[0]));
  } catch (e) {
    console.error("[AgentAccounts] update error:", e);
    res.status(500).json({ error: "Failed to update agent account" });
  }
});

// ─── Reset password and re-send credentials ────────────────────────────────────

router.post("/:id/reset-password", isAdminAuthenticated, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid agent id" });

  try {
    const { rows } = await pool.query<{ id: number; name: string | null; email: string | null; personal_email: string | null }>(
      `SELECT id, name, email, personal_email FROM support_agents WHERE id = $1`,
      [id]
    );
    const agent = rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!agent.personal_email) {
      return res.status(400).json({ error: "This agent has no personal email on file to send the new password to" });
    }

    const tempPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await pool.query(`UPDATE support_agents SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);

    const { html, text } = credentialsEmail(agent.name ?? "there", agent.email ?? "", tempPassword);
    const emailResult = await sendEmail(
      1,
      agent.personal_email,
      "Your Certxa Back Office Password Has Been Reset",
      html,
      text
    );
    if (!emailResult.success) {
      console.error(`[AgentAccounts] Password reset email failed for agent ${id}:`, emailResult.error);
    }

    res.json({
      temporaryPassword: tempPassword,
      emailSent: emailResult.success,
      emailError: emailResult.success ? undefined : emailResult.error,
    });
  } catch (e) {
    console.error("[AgentAccounts] reset-password error:", e);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
