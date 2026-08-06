ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar DEFAULT 'admin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_id" integer;
