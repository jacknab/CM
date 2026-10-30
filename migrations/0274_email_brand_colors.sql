-- One look for every e-mail (owner, 2026-10-30; lib/emailLayout.ts). The lifecycle campaign e-mails are stored
-- here with their old button colour and paragraph size; they now match the shared layout's purple and 15px text.
-- (The migration runner splits on semicolons, so the CSS separators are written as chr(59).)
UPDATE platform_email_steps
   SET html_template = replace(replace(html_template, '#6d5dfc', '#6D4AE0'),
         'font-size:16px' || chr(59) || 'line-height:1.65' || chr(59) || 'margin:0 0 18px',
         'font-size:15px' || chr(59) || 'line-height:1.65' || chr(59) || 'margin:0 0 16px' || chr(59) || 'color:#3B3748'),
       updated_at = now()
 WHERE html_template ILIKE '%#6d5dfc%'
