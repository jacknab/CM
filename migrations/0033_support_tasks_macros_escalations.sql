-- Support macros (reusable reply templates)
CREATE TABLE IF NOT EXISTS support_macros (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  created_by  INTEGER REFERENCES support_agents(id),
  is_shared   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO support_macros (title, content, category) VALUES
  ('Password Reset Instructions', 'Hi there,

To reset your password, please follow these steps:
1. Go to your login page
2. Click "Forgot Password"
3. Enter your email address
4. Check your inbox for the reset link

The link will expire in 24 hours. Let us know if you need any further assistance!', 'auth'),
  ('AI Receptionist Troubleshooting', 'Hi,

Thank you for reaching out about your AI Receptionist. Here are some common fixes:

1. **Check your Twilio number** — Ensure it is properly linked in Settings > AI Receptionist
2. **Verify business hours** — The AI only answers calls during your configured hours
3. **Review call logs** — Go to AI Receptionist > Call Logs to see recent activity

If the issue persists, please share your Twilio phone number so we can investigate further.', 'ai'),
  ('Booking Sync Fix', 'Hi,

We appreciate you contacting us about the booking sync issue.

Please try these steps:
1. Go to Settings > Integrations
2. Disconnect and reconnect your calendar
3. Wait 5 minutes for the sync to complete

If the issue continues, we will escalate this to our technical team.', 'booking'),
  ('Billing Issue Response', 'Hi,

Thank you for bringing this billing concern to our attention.

We have reviewed your account and will resolve this within 1–2 business days. If you have been charged incorrectly, we will issue a full refund.

Please do not hesitate to reach out if you have any additional questions.', 'billing'),
  ('Trial Extension Confirmation', 'Great news! We have extended your trial period. You now have additional time to explore all the features Certxa has to offer.

Please let us know if you have any questions or need help getting the most out of your trial.', 'billing')
ON CONFLICT DO NOTHING;

-- Support tasks
CREATE TABLE IF NOT EXISTS support_tasks (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  assigned_to   INTEGER REFERENCES support_agents(id),
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  due_date      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_by    INTEGER REFERENCES support_agents(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tasks_ticket_id ON support_tasks(ticket_id);

-- Support escalations
CREATE TABLE IF NOT EXISTS support_escalations (
  id               SERIAL PRIMARY KEY,
  ticket_id        INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  assigned_team    TEXT NOT NULL DEFAULT 'engineering',
  reason           TEXT NOT NULL,
  created_by       INTEGER REFERENCES support_agents(id),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_escalations_ticket_id ON support_escalations(ticket_id);
