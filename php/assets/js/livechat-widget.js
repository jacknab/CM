/*!
 * Certxa Live Chat — standalone widget for the marketing site (no framework).
 * Talks to the same API as the in-app React widget:
 *   GET  /api/live-chat/departments
 *   POST /api/live-chat/start          {visitorName,visitorEmail,departmentId?,subject,pageUrl}
 *   POST /api/live-chat/:id/rate       {rating,comment}
 *   WS   /ws/live-chat?role=visitor&chatId=<id>
 * Load once, from footer.php:  <script src="/assets/js/livechat-widget.js" defer></script>
 */
(function () {
  "use strict";
  if (window.__certxaChatLoaded) return;
  window.__certxaChatLoaded = true;

  var LS_KEY = "certxa_chat";
  var VID_KEY = "certxa_vid";
  var ACCENT = "#6d28d9";           // violet-700
  var ACCENT_DK = "#5b21b6";

  // ── visitor presence beacon ───────────────────────────────────────────────
  // A stable per-browser id + a heartbeat so the support team can see who's
  // browsing the site in real time (passive list — no proactive chat).
  var visitorId = (function () {
    try {
      var v = localStorage.getItem(VID_KEY);
      if (!v) {
        v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(VID_KEY, v);
      }
      return v;
    } catch (e) { return "v-" + Math.random().toString(36).slice(2); }
  })();

  function beaconPing() {
    try {
      fetch("/api/live-chat/visitor/ping", {
        method: "POST", credentials: "include", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: visitorId,
          url: location.pathname + location.search,
          title: (document.title || "").slice(0, 200),
          referrer: document.referrer || "",
        }),
      }).catch(function () {});
    } catch (e) {}
  }
  function beaconLeave() {
    try {
      var body = new Blob([JSON.stringify({ visitorId: visitorId })], { type: "application/json" });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/live-chat/visitor/leave", body);
    } catch (e) {}
  }
  beaconPing();
  setInterval(beaconPing, 25000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") beaconPing();
  });
  window.addEventListener("pagehide", beaconLeave);

  // ── styles ────────────────────────────────────────────────────────────────
  var css = "\
  .cxlc-launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border:0;border-radius:50%;\
    background:" + ACCENT + ";color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(109,40,217,.35);display:flex;align-items:center;\
    justify-content:center;transition:transform .15s ease}\
  .cxlc-launch:hover{transform:scale(1.06)}\
  .cxlc-launch svg{width:26px;height:26px}\
  .cxlc-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#f43f5e;\
    color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center}\
  .cxlc-panel{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);height:540px;\
    max-height:calc(100vh - 120px);background:#fff;border:1px solid #eee;border-radius:16px;overflow:hidden;display:flex;\
    flex-direction:column;box-shadow:0 20px 50px rgba(80,40,140,.28);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;\
    transform-origin:bottom right;transition:transform .18s cubic-bezier(.4,0,.2,1),opacity .16s ease}\
  .cxlc-hidden{transform:scale(.85);opacity:0;pointer-events:none}\
  .cxlc-hd{display:flex;align-items:center;gap:12px;padding:12px 14px;background:linear-gradient(135deg," + ACCENT + "," + ACCENT_DK + ");color:#fff;flex:0 0 auto}\
  .cxlc-hd .cxlc-av{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}\
  .cxlc-hd .cxlc-t{flex:1;min-width:0}\
  .cxlc-hd .cxlc-t b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
  .cxlc-hd .cxlc-t span{font-size:11px;color:#ddd6fe}\
  .cxlc-hd button{background:0;border:0;color:#ddd6fe;cursor:pointer;font:600 12px system-ui;padding:4px 6px;border-radius:6px}\
  .cxlc-hd button:hover{color:#fff}\
  .cxlc-body{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#f9fafb}\
  .cxlc-scroll{flex:1;overflow-y:auto;padding:14px}\
  .cxlc-form label{display:block;font:600 11px system-ui;color:#4b5563;margin:10px 0 4px}\
  .cxlc-form input,.cxlc-form select,.cxlc-form textarea{width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:10px;\
    padding:9px 10px;font:400 13px system-ui;outline:0}\
  .cxlc-form input:focus,.cxlc-form select:focus,.cxlc-form textarea:focus{border-color:" + ACCENT + ";box-shadow:0 0 0 3px rgba(109,40,217,.15)}\
  .cxlc-form .cxlc-row{display:flex;gap:8px}.cxlc-form .cxlc-row>div{flex:1}\
  .cxlc-btn{width:100%;margin-top:14px;border:0;border-radius:10px;background:" + ACCENT + ";color:#fff;font:600 13px system-ui;\
    padding:10px;cursor:pointer}.cxlc-btn:hover{background:" + ACCENT_DK + "}.cxlc-btn:disabled{opacity:.5;cursor:default}\
  .cxlc-lede{text-align:center;margin-bottom:6px}\
  .cxlc-lede b{font-size:13px;color:#1f2937}.cxlc-lede p{margin:2px 0 0;font-size:11px;color:#6b7280}\
  .cxlc-err{color:#dc2626;font-size:11px;margin-top:8px;text-align:center}\
  .cxlc-queue{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:10px;padding:20px}\
  .cxlc-queue .cxlc-num{width:64px;height:64px;border-radius:50%;background:#ede9fe;color:" + ACCENT + ";display:flex;align-items:center;justify-content:center;font:700 26px system-ui}\
  .cxlc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}\
  .cxlc-m{max-width:80%;padding:8px 11px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word}\
  .cxlc-m.v{align-self:flex-end;background:" + ACCENT + ";color:#fff;border-bottom-right-radius:4px}\
  .cxlc-m.a{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:4px}\
  .cxlc-m .cxlc-who{font:600 9px system-ui;color:" + ACCENT + ";margin-bottom:2px}\
  .cxlc-m .cxlc-ts{font-size:10px;opacity:.7;margin-top:2px}\
  .cxlc-sys{align-self:center;font-size:11px;color:#9ca3af;background:#f3f4f6;border-radius:10px;padding:3px 10px}\
  .cxlc-input{flex:0 0 auto;display:flex;gap:8px;padding:10px;background:#fff;border-top:1px solid #f0f0f0}\
  .cxlc-input textarea{flex:1;resize:none;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;font:400 13px system-ui;max-height:96px;outline:0}\
  .cxlc-input textarea:focus{border-color:" + ACCENT + "}\
  .cxlc-input button{flex:0 0 auto;width:36px;height:36px;border:0;border-radius:10px;background:" + ACCENT + ";color:#fff;cursor:pointer}\
  .cxlc-input button:disabled{opacity:.4}\
  .cxlc-stars{display:flex;gap:8px;justify-content:center;margin:8px 0}\
  .cxlc-stars button{width:38px;height:38px;border:0;border-radius:10px;background:#f3f4f6;color:#d1d5db;font-size:18px;cursor:pointer}\
  .cxlc-stars button.on{background:#fbbf24;color:#fff}\
  @media (max-width:420px){.cxlc-panel{right:8px;left:8px;width:auto;bottom:80px}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM ───────────────────────────────────────────────────────────────────
  var launch = el("button", "cxlc-launch", { title: "Chat with us", "aria-label": "Open chat" });
  launch.innerHTML = svgChat();
  var badge = el("span", "cxlc-badge"); badge.style.display = "none";
  launch.appendChild(badge);

  var panel = el("div", "cxlc-panel cxlc-hidden");
  panel.innerHTML =
    '<div class="cxlc-hd"><div class="cxlc-av" data-av>' + svgChatSm() + '</div>' +
    '<div class="cxlc-t"><b data-title>Certxa Support</b><span data-sub>We\'re here to help</span></div>' +
    '<button data-end style="display:none">End</button><button data-min title="Minimize">&#8211;</button></div>' +
    '<div class="cxlc-body" data-body></div>';
  var hdTitle = q(panel, "[data-title]"), hdSub = q(panel, "[data-sub]"),
      hdAv = q(panel, "[data-av]"), body = q(panel, "[data-body]"),
      btnEnd = q(panel, "[data-end]"), btnMin = q(panel, "[data-min]");

  document.body.appendChild(launch);
  document.body.appendChild(panel);

  // ── state ─────────────────────────────────────────────────────────────────
  var open = false, step = "form", chatId = "", depts = [], ws = null,
      agentName = "Support Agent", unread = 0, terminal = false,
      reconnectT = null, hbT = null, visitorName = "";

  launch.onclick = function () { setOpen(!open); };
  btnMin.onclick = function () { setOpen(false); };
  btnEnd.onclick = function () { confirmEnd(); };
  window.addEventListener("certxa:open-chat", function () { setOpen(true); });
  window.certxaChat = { open: function () { setOpen(true); }, close: function () { setOpen(false); } };

  function setOpen(v) {
    open = v;
    panel.classList.toggle("cxlc-hidden", !v);
    if (v) { unread = 0; badge.style.display = "none"; }
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  fetchJson("/api/live-chat/departments").then(function (d) {
    depts = (d && d.departments) || [];
  }).catch(function () {}).then(render);

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && saved.chatId && (saved.step === "queue" || saved.step === "chat")) {
      chatId = saved.chatId; visitorName = saved.visitorName || "";
      step = saved.step; connectWs(chatId); setOpen(true);
    }
  } catch (e) {}

  // ── rendering ─────────────────────────────────────────────────────────────
  function render() {
    q(panel, ".cxlc-hd").querySelector("[data-end]").style.display = step === "chat" ? "" : "none";
    hdTitle.textContent =
      step === "queue" ? "Waiting for an agent…" :
      step === "chat" ? agentName :
      (step === "rating" || step === "done") ? "Rate your experience" : "Certxa Support";
    hdSub.textContent =
      step === "chat" ? "Certxa Support · Online" :
      step === "queue" ? "Certxa Support" : "We’re here to help";
    hdAv.textContent = step === "chat" ? agentName.charAt(0).toUpperCase() : "";
    if (step !== "chat") hdAv.innerHTML = svgChatSm();

    if (step === "form") return renderForm();
    if (step === "queue") return renderQueue();
    if (step === "chat") return renderChat();
    if (step === "rating") return renderRating();
    if (step === "done") { body.innerHTML = '<div class="cxlc-queue"><b>Thanks for chatting!</b></div>'; }
  }

  function renderForm() {
    var opts = depts.map(function (d) {
      return '<option value="' + d.id + '">' + esc(d.name) + "</option>";
    }).join("");
    body.innerHTML =
      '<form class="cxlc-form cxlc-scroll">' +
      '<div class="cxlc-lede"><b>Start a conversation</b><p>We typically reply in a few minutes.</p></div>' +
      '<div class="cxlc-row"><div><label>Name</label><input name="name" autocomplete="name" required></div>' +
      '<div><label>Email</label><input name="email" type="email" autocomplete="email" required></div></div>' +
      (opts ? '<label>Topic</label><select name="dept"><option value="">General</option>' + opts + "</select>" : "") +
      '<label>How can we help?</label><textarea name="subject" rows="2" required></textarea>' +
      '<div class="cxlc-err" data-err></div>' +
      '<button class="cxlc-btn" type="submit">Start chat</button></form>';
    var f = q(body, "form"), err = q(body, "[data-err]");
    f.onsubmit = function (e) {
      e.preventDefault();
      var btn = q(f, "button"); btn.disabled = true; err.textContent = "";
      start({
        name: f.name.value.trim(), email: f.email.value.trim(),
        deptId: f.dept ? f.dept.value : "", subject: f.subject.value.trim(),
      }).catch(function () { err.textContent = "Something went wrong. Please try again."; btn.disabled = false; });
    };
  }

  function renderQueue() {
    body.innerHTML =
      '<div class="cxlc-queue"><div class="cxlc-num" data-pos>1</div>' +
      '<b>You’re in the queue</b><p style="font-size:12px;color:#6b7280;margin:0" data-wait></p>' +
      '<p style="font-size:11px;color:#9ca3af">We’ll connect you with the next available agent.</p></div>';
  }

  function renderChat() {
    body.innerHTML =
      '<div class="cxlc-msgs" data-msgs></div>' +
      '<div class="cxlc-input"><textarea rows="1" placeholder="Type a message…"></textarea>' +
      '<button title="Send" disabled>' + svgSend() + "</button></div>";
    var ta = q(body, "textarea"), sb = q(body, ".cxlc-input button");
    ta.oninput = function () { sb.disabled = !ta.value.trim(); };
    ta.onkeydown = function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(ta, sb); }
    };
    sb.onclick = function () { sendMsg(ta, sb); };
    (msgBuffer || []).forEach(addBubble);
  }

  function renderRating() {
    body.innerHTML =
      '<div class="cxlc-scroll" style="text-align:center">' +
      '<p style="font:700 14px system-ui;margin:16px 0 2px">How did we do?</p>' +
      '<p style="font-size:12px;color:#6b7280;margin:0">Rate your chat' + (agentName !== "Support Agent" ? " with " + esc(agentName) : "") + "</p>" +
      '<div class="cxlc-stars">' + [1,2,3,4,5].map(function (n) {
        return '<button data-n="' + n + '">★</button>';
      }).join("") + "</div>" +
      '<textarea rows="2" placeholder="Tell us more (optional)…" style="width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:10px;padding:8px;font:400 13px system-ui"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="cxlc-btn" style="background:#fff;color:#6b7280;border:1px solid #e5e7eb" data-skip>Skip</button>' +
      '<button class="cxlc-btn" data-submit disabled>Submit</button></div></div>';
    var rating = 0, stars = qa(body, ".cxlc-stars button"), sub = q(body, "[data-submit]");
    stars.forEach(function (s, i) {
      s.onclick = function () {
        rating = i + 1; sub.disabled = false;
        stars.forEach(function (x, j) { x.classList.toggle("on", j <= i); });
      };
    });
    q(body, "[data-skip]").onclick = function () { finish(); };
    sub.onclick = function () {
      sub.disabled = true;
      fetchJson("/api/live-chat/" + chatId + "/rate", {
        method: "POST", body: JSON.stringify({ rating: rating, comment: q(body, "textarea").value }),
      }).catch(function () {}).then(function () {
        body.innerHTML = '<div class="cxlc-queue"><b>Thank you for the feedback!</b></div>';
        setTimeout(finish, 1800);
      });
    };
  }

  // ── chat data ─────────────────────────────────────────────────────────────
  var msgBuffer = [];
  function addBubble(m) {
    var box = q(body, "[data-msgs]"); if (!box) return;
    var d = document.createElement("div");
    if (m.role === "system") { d.className = "cxlc-sys"; d.textContent = m.content; }
    else {
      d.className = "cxlc-m " + (m.role === "visitor" ? "v" : "a");
      d.innerHTML = (m.role === "agent" && m.agentName ? '<div class="cxlc-who">' + esc(m.agentName) + "</div>" : "") +
        esc(m.content) + (m.timestamp ? '<div class="cxlc-ts">' + fmtTime(m.timestamp) + "</div>" : "");
    }
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  function pushMsg(m) { msgBuffer.push(m); if (step === "chat") addBubble(m); }

  function sendMsg(ta, sb) {
    var t = ta.value.trim(); if (!t) return;
    pushMsg({ role: "visitor", content: t, timestamp: new Date().toISOString() });
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "message", content: t }));
    ta.value = ""; sb.disabled = true; ta.focus();
  }

  function start(v) {
    return fetchJson("/api/live-chat/start", {
      method: "POST",
      body: JSON.stringify({
        visitorName: v.name, visitorEmail: v.email,
        departmentId: v.deptId || undefined, subject: v.subject, pageUrl: location.href,
        visitorId: visitorId,
      }),
    }).then(function (data) {
      chatId = data.chatId; visitorName = v.name;
      persist("queue");
      connectWs(chatId);
      step = "queue"; render();
      var pos = q(body, "[data-pos]"); if (pos) pos.textContent = data.queuePosition || 1;
      var w = q(body, "[data-wait]");
      if (w && data.estimatedWaitMin != null) w.textContent = "Estimated wait ~" + data.estimatedWaitMin + " min";
    });
  }

  // ── websocket ─────────────────────────────────────────────────────────────
  function connectWs(cid) {
    clearTimeout(reconnectT);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} }
    var proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(proto + "://" + location.host + "/ws/live-chat?role=visitor&chatId=" + encodeURIComponent(cid));

    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "queue_position") {
        step = "queue"; render();
        var pos = q(body, "[data-pos]"); if (pos) pos.textContent = m.position;
        var w = q(body, "[data-wait]");
        if (w && m.estimatedWaitMin != null) w.textContent = "Estimated wait ~" + m.estimatedWaitMin + " min";
      } else if (m.type === "assigned") {
        agentName = m.agentName || "Support Agent";
        if (step !== "chat") { pushMsg({ role: "system", content: agentName + " joined the chat" }); }
        step = "chat"; persist("chat"); render();
      } else if (m.type === "message") {
        pushMsg({ role: "agent", content: m.content, agentName: m.agentName, timestamp: m.timestamp });
        if (!open) { unread++; badge.textContent = unread; badge.style.display = ""; }
      } else if (m.type === "transferred") {
        pushMsg({ role: "system", content: m.agentName ? "Chat transferred to " + m.agentName : "Chat transferred to " + (m.departmentName || "another team") });
        if (m.agentName) { agentName = m.agentName; render(); }
        else { step = "queue"; persist("queue"); render(); }
      } else if (m.type === "closed") {
        terminal = true;
        pushMsg({ role: "system", content: "Chat ended by agent" });
        localStorage.removeItem(LS_KEY);
        setTimeout(function () { step = "rating"; render(); }, 1200);
      }
    };
    ws.onclose = function () {
      clearInterval(hbT);
      if (terminal) return;
      reconnectT = setTimeout(function () { if (!terminal) connectWs(cid); }, 4000);
    };
    ws.onopen = function () {
      clearInterval(hbT);
      hbT = setInterval(function () {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
    };
  }

  function confirmEnd() {
    if (!confirm("End this chat? You'll have a chance to rate your experience.")) return;
    if (ws) try { ws.close(); } catch (e) {}
    localStorage.removeItem(LS_KEY);
    step = "rating"; render();
  }

  function finish() {
    step = "form"; chatId = ""; msgBuffer = []; terminal = false; visitorName = "";
    setOpen(false); render();
  }

  function persist(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ chatId: chatId, step: s, visitorName: visitorName })); } catch (e) {}
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function fetchJson(url, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  function el(tag, cls, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function svgChat() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'; }
  function svgChatSm() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'; }
  function svgSend() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'; }
})();
