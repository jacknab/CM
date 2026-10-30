-- One look for every e-mail (owner, 2026-10-30; lib/emailLayout.ts). The lifecycle campaign e-mails are stored
-- here with their old button colour and paragraph size; they now match the shared layout's purple and 15px text.
UPDATE platform_email_steps
   SET html_template = replace(replace(html_template, '#6d5dfc', '#6D4AE0'), 'font-size:16px;line-height:1.65;margin:0 0 18px', 'font-size:15px;line-height:1.65;margin:0 0 16px;color:#3B3748'),
       updated_at = now()
 WHERE html_template ILIKE '%#6d5dfc%' OR html_template LIKE '%font-size:16px;line-height:1.65;margin:0 0 18px%';
