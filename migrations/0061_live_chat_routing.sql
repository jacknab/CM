-- Smart routing: agent ↔ department assignments
CREATE TABLE IF NOT EXISTS live_chat_agent_departments (
  agent_id      INTEGER NOT NULL REFERENCES support_agents(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES live_chat_departments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, department_id)
);

-- Routing keywords per department (comma-separated, e.g. "billing,invoice,payment")
ALTER TABLE live_chat_departments ADD COLUMN IF NOT EXISTS routing_keywords TEXT;

-- Track how the chat was routed
ALTER TABLE live_chats ADD COLUMN IF NOT EXISTS routed_by TEXT DEFAULT 'manual';

-- Default routing keywords for existing departments
UPDATE live_chat_departments SET routing_keywords = 'billing,invoice,payment,charge,refund,subscription,plan,pricing,cost'
  WHERE LOWER(name) LIKE '%billing%' AND (routing_keywords IS NULL OR routing_keywords = '');

UPDATE live_chat_departments SET routing_keywords = 'bug,error,crash,broken,not working,technical,integration,api,setup,install,issue'
  WHERE LOWER(name) LIKE '%technical%' AND (routing_keywords IS NULL OR routing_keywords = '');

UPDATE live_chat_departments SET routing_keywords = 'sales,demo,trial,pricing,upgrade,enterprise,quote'
  WHERE LOWER(name) LIKE '%sales%' AND (routing_keywords IS NULL OR routing_keywords = '');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lc_agent_depts_agent ON live_chat_agent_departments (agent_id);
CREATE INDEX IF NOT EXISTS idx_lc_agent_depts_dept  ON live_chat_agent_departments (department_id);
