<?php
// /checkin is an alias that previously included checkin-kiosk content directly.
// A 301 redirect consolidates all ranking signals onto the canonical URL
// and prevents Google from indexing duplicate content at two addresses.
header('Location: /checkin-kiosk', true, 301);
exit;
