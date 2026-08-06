import { Router } from "express";
import { createHmac } from "crypto";
import { pool } from "../db";
import {
  appUrl,
  ensurePlatformEmailCampaigns,
  getPlatformEmailCampaign,
  getPlatformEmailCampaigns,
  launchPlatformEmailCampaign,
  processPlatformEmailCampaigns,
  suppressPlatformEmail,
  verifyPlatformToken,
} from "../services/platform-email-engine";

const router = Router();

async function requirePlatformAdmin(req: any, res: any): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  const result = await pool.query<{ is_admin: boolean; role: string }>(
    `SELECT is_admin, role FROM users WHERE id=$1 LIMIT 1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user || (!user.is_admin && user.role !== "admin")) {
    res.status(403).json({ message: "Platform admin access required" });
    return false;
  }
  return true;
}

router.get("/api/admin/platform-email-campaigns", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  try {
    await ensurePlatformEmailCampaigns();
    const campaigns = await getPlatformEmailCampaigns();
    const totals = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status='sent')::int AS sent,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked
       FROM platform_email_deliveries`,
    );
    return res.json({ campaigns, totals: totals.rows[0] });
  } catch (error: any) {
    console.error("[PlatformEmail] list error:", error?.message);
    return res.status(500).json({ message: "Failed to load platform email campaigns" });
  }
});

router.get("/api/admin/platform-email-campaigns/:id", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  try {
    const campaign = await getPlatformEmailCampaign(Number(req.params.id));
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    const stats = await pool.query(
      `SELECT
         COUNT(DISTINCT e.id)::int AS enrolled,
         COUNT(*) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked'))::int AS delivered,
         COUNT(*) FILTER (WHERE d.status='sent')::int AS sent,
         COUNT(*) FILTER (WHERE d.opened_at IS NOT NULL)::int AS opened,
         COUNT(*) FILTER (WHERE d.clicked_at IS NOT NULL)::int AS clicked,
         ROUND(CASE WHEN COUNT(*) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked')) = 0
           THEN 0 ELSE COUNT(*) FILTER (WHERE d.opened_at IS NOT NULL)::numeric /
             COUNT(*) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked')) END, 4)::float AS "openRate",
         ROUND(CASE WHEN COUNT(*) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked')) = 0
           THEN 0 ELSE COUNT(*) FILTER (WHERE d.clicked_at IS NOT NULL)::numeric /
             COUNT(*) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked')) END, 4)::float AS "clickRate"
       FROM platform_email_enrollments e
       LEFT JOIN platform_email_deliveries d
         ON d.campaign_id=e.campaign_id AND d.user_id=e.user_id
      WHERE e.campaign_id=$1`,
      [req.params.id],
    );
    return res.json({ campaign, stats: stats.rows[0] ?? {} });
  } catch (error: any) {
    console.error("[PlatformEmail] detail error:", error?.message);
    return res.status(500).json({ message: "Failed to load campaign" });
  }
});

router.patch("/api/admin/platform-email-campaigns/:id", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const { name, description, category, triggerEvent, status, audienceRule, fromName, replyTo, steps } = req.body || {};
  if (!name || !triggerEvent || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ message: "name, triggerEvent, and at least one step are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const campaign = await client.query(
      `UPDATE platform_email_campaigns SET name=$2,description=$3,category=$4,trigger_event=$5,
        status=$6,audience_rule=$7::jsonb,from_name=$8,reply_to=$9,updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, name, description || null, category || "lifecycle", triggerEvent, status || "draft", JSON.stringify(audienceRule || {}), fromName || null, replyTo || null],
    );
    if (!campaign.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Campaign not found" });
    }
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      await client.query(
        `INSERT INTO platform_email_steps
          (campaign_id,step_order,delay_minutes,subject,preview_text,html_template,text_template,cta_label,cta_url,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
         ON CONFLICT (campaign_id,step_order) DO UPDATE SET
          delay_minutes=EXCLUDED.delay_minutes,subject=EXCLUDED.subject,preview_text=EXCLUDED.preview_text,
          html_template=EXCLUDED.html_template,text_template=EXCLUDED.text_template,cta_label=EXCLUDED.cta_label,
          cta_url=EXCLUDED.cta_url,is_active=TRUE,updated_at=NOW()`,
        [req.params.id, index + 1, Number(step.delayMinutes) || 0, step.subject, step.previewText || null, step.htmlTemplate, step.textTemplate || null, step.ctaLabel || null, step.ctaUrl || null],
      );
    }
    await client.query(`UPDATE platform_email_steps SET is_active=FALSE WHERE campaign_id=$1 AND step_order>$2`, [req.params.id, steps.length]);
    await client.query("COMMIT");
    return res.json(await getPlatformEmailCampaign(Number(req.params.id)));
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[PlatformEmail] update error:", error?.message);
    return res.status(500).json({ message: "Failed to update campaign" });
  } finally {
    client.release();
  }
});

router.post("/api/admin/platform-email-campaigns/:id/launch", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  try {
    const result = await launchPlatformEmailCampaign(Number(req.params.id), Array.isArray(req.body?.userIds) ? req.body.userIds : undefined);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to launch campaign" });
  }
});

router.post("/api/admin/platform-email-campaigns/:id/pause", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  await pool.query(`UPDATE platform_email_campaigns SET status='paused',updated_at=NOW() WHERE id=$1`, [req.params.id]);
  return res.json({ ok: true });
});

router.post("/api/admin/platform-email-campaigns/:id/activate", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  await pool.query(`UPDATE platform_email_campaigns SET status='active',updated_at=NOW() WHERE id=$1`, [req.params.id]);
  return res.json({ ok: true });
});

router.post("/api/admin/platform-email-campaigns/process", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  return res.json(await processPlatformEmailCampaigns());
});

router.get("/api/platform-emails/unsubscribe", async (req, res) => {
  const userId = String(req.query.uid || "");
  const token = String(req.query.token || "");
  if (!userId || !verifyPlatformToken(`unsubscribe:${userId}`, token)) {
    return res.status(403).send("<h1>Invalid unsubscribe link</h1><p>Please use the original link from your email.</p>");
  }
  const result = await pool.query<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [userId]);
  if (!result.rows[0]) return res.status(404).send("<h1>Account not found</h1>");
  await suppressPlatformEmail(userId, result.rows[0].email);
  return res.send(`<!doctype html><html><body style="font-family:Arial;padding:48px;max-width:560px;margin:auto"><h1>You’re unsubscribed</h1><p>You will no longer receive Certxa marketing emails. Critical account and billing messages may still be sent.</p><a href="${appUrl("/")}">Return to Certxa</a></body></html>`);
});

router.get("/api/platform-emails/track/open/:id", async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.query.token || "");
  if (id && verifyPlatformToken(`open:${id}`, token)) {
    await pool.query(`UPDATE platform_email_deliveries SET opened_at=COALESCE(opened_at,NOW()) WHERE id=$1`, [id]);
    await pool.query(`INSERT INTO platform_email_events (delivery_id,event_type) VALUES ($1,'opened')`, [id]);
  }
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store");
  return res.end(pixel);
});

router.get("/api/platform-emails/track/click/:id", async (req, res) => {
  const id = Number(req.params.id);
  const destination = String(req.query.url || appUrl("/"));
  const token = String(req.query.token || "");
  if (!id || !destination || !verifyPlatformToken(`click:${id}:${destination}`, token)) return res.status(403).send("Invalid link");
  await pool.query(`UPDATE platform_email_deliveries SET clicked_at=COALESCE(clicked_at,NOW()) WHERE id=$1`, [id]);
  await pool.query(`INSERT INTO platform_email_events (delivery_id,event_type,payload) VALUES ($1,'clicked',$2::jsonb)`, [id, JSON.stringify({ destination })]);
  return res.redirect(destination);
});

router.post("/api/webhooks/mailgun/platform-email", async (req, res) => {
  const eventData = req.body?.["event-data"] || req.body || {};
  const signature = eventData.signature || req.body?.signature;
  if (signature?.timestamp && signature?.token && process.env.MAILGUN_WEBHOOK_SIGNING_KEY) {
    const expected = createHmac("sha256", process.env.MAILGUN_WEBHOOK_SIGNING_KEY)
      .update(`${signature.timestamp}${signature.token}`).digest("hex");
    if (expected !== signature.signature) return res.status(403).json({ message: "Invalid signature" });
  }
  const providerId = String(eventData.id || eventData.message?.headers?.["message-id"] || "");
  const event = String(eventData.event || "");
  const statusMap: Record<string, string> = { delivered: "delivered", opened: "opened", clicked: "clicked", failed: "failed", permanent_fail: "bounced", complained: "complained" };
  if (providerId && event) {
    const delivery = await pool.query<{ id: number }>(`SELECT id FROM platform_email_deliveries WHERE provider_id=$1 LIMIT 1`, [providerId]);
    if (delivery.rows[0]) {
      const id = delivery.rows[0].id;
      if (event === "opened") await pool.query(`UPDATE platform_email_deliveries SET opened_at=COALESCE(opened_at,NOW()) WHERE id=$1`, [id]);
      if (event === "clicked") await pool.query(`UPDATE platform_email_deliveries SET clicked_at=COALESCE(clicked_at,NOW()) WHERE id=$1`, [id]);
      if (statusMap[event] && ["failed", "bounced", "complained"].includes(statusMap[event])) {
        await pool.query(`UPDATE platform_email_deliveries SET status=$2,error=$3 WHERE id=$1`, [id, statusMap[event], eventData.reason || event]);
      }
      await pool.query(`INSERT INTO platform_email_events (delivery_id,event_type,payload) VALUES ($1,$2,$3::jsonb)`, [id, event, JSON.stringify(eventData)]);
    }
  }
  return res.json({ ok: true });
});

export default router;