# Website messages for Certxa Pro (owner, 2026-11-07)

A client writes to a Certxa Pro business from its website; the pro reads and answers in the app; the client gets
each answer by e-mail with a link to a private page where they read the conversation and write back.

## Pieces
- **Website form**: Solo websites (`SoloTheme`): the Contact tab after Portfolio, Contact in the phone menu, About › Contact ›
  "Send a message", or `<slug>.certxa.com/#message`. A sheet over the site in its own look (`SiteMessage.tsx`): Name,
  Email, Message (the subject is the start of the message), and the business's phone number when there is one.
- **Client's private page**: `certxa.com/msg/<code>` (`pages/MessageThread.tsx`). Every e-mail carries its own code;
  all keep working until the conversation is deleted. Only the SHA-256 of a code is stored (`pro_message_links`).
- **Server**: `routes/proMessages.ts`, migration `0322_pro_messages.sql` (`pro_message_threads`, `pro_messages`,
  `pro_message_links`). Public `/api/public/...`, pro `/api/pro/messages...` (both inside the Solo API allow-list).
- **App** (OTA, no new build): Home › envelope top right with the unread count (`app/(tabs)/index.tsx`,
  `lib/inbox.ts`) › Inbox (`app/inbox/index.tsx`) › conversation (`app/inbox/[id].tsx`): answer, delete (spam), the
  client's profile when the e-mail matches a client. A push (`type: web_message`) opens the conversation.

## E-mails (Mailgun, the business's name at the top)
- To the client when they send the first message: a copy with the link to the conversation.
- To the client on every answer from the pro: the answer and "View and reply". Replying to the e-mail itself doesn't
  reach the pro (said in the e-mail).

## Spam protection (server)
Google reCAPTCHA v3 (invisible; `lib/recaptcha.ts`, keys `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` / `RECAPTCHA_MIN_SCORE` = 0.5 in `/etc/certxa.env`, backup `/root/certxa.env.bak-2026-11-07-recaptcha`; scores logged as `[pro-messages] recaptcha …`; Google unreachable = allowed). The pages show Google's notice and hide its badge; the site's CSP allows www.google.com + www.gstatic.com scripts. Also: hidden trap field and a 3-second minimum to fill in the form (both answered "OK" without saving, so bots learn
nothing); at most 3 links; per sender address (salted hash) 10 messages an hour and 30 a day; per e-mail 3 new
conversations an hour per business; per conversation 15 client replies an hour; the same message twice in 10 minutes
dropped; a per-process rate limit in front.

## Live (instant messenger, 2026-11-07)
- `lib/proMessagesLive.ts`: WebSocket `/ws/pro-messages`. The app (`?as=pro`, Bearer token in a header) connects only while
  it is on screen (`lib/inboxLive.ts` in the app) = online. A client page (`?as=client&link=<code>`) gets the pro's
  answers, typing and online status. Typing is relayed only, never stored. Events go through the cross-process bus;
  `pm:online:<store>` and `pm:viewer:<thread>` are 45-second Redis keys renewed every 20 s.
- Pro online: client messages arrive live and the app chimes (local notification with `soft_chime.wav`), no push.
  Pro away: a push for the first unread message of a conversation only, again after the pro reads it.
- Client page open: the pro's answer appears live, no e-mail. Page closed: the e-mail with the link, as before.
- Client page shows "Online now" (green dot) or "Away · you'll get the answer by e-mail", and "<Business> is typing…".

## Status
- 2026-11-07: built and tested (34 server + 13 browser checks on the isolated server). Server + website deployed with
  the migration; the app part ships with the next OTA (`scripts/ota-update.sh`).
