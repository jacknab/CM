<?php
// /pro used to dump a stale, pre-migration static index.html here (dead
// /style.css and /vite.svg references — the site's real assets live at
// /assets/css/style.css since the php/ template migration). That file no
// longer exists. /overview is the real, current "professional version of
// the site" — the full B2B feature-tour page — so redirect there instead
// of resurrecting broken content.
header('Location: /overview', true, 301);
exit;
