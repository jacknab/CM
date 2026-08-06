-- Blog posts table for the Certxa marketing blog.
-- Managed from /isadmin/blog in the back office; served publicly at /blog.

CREATE TABLE IF NOT EXISTS blog_posts (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255)  NOT NULL,
  slug         VARCHAR(255)  NOT NULL UNIQUE,
  excerpt      TEXT,
  content      TEXT,
  category     VARCHAR(100)  NOT NULL DEFAULT 'General',
  author_name  VARCHAR(100)  NOT NULL DEFAULT 'Certxa Team',
  cover_color  VARCHAR(20)   NOT NULL DEFAULT '#7c3aed',
  cover_emoji  VARCHAR(10)   NOT NULL DEFAULT '📝',
  read_time    VARCHAR(20)   NOT NULL DEFAULT '5 min read',
  is_featured  BOOLEAN       NOT NULL DEFAULT false,
  status       VARCHAR(20)   NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx   ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts (status);
