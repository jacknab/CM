/**
 * Animated call illustration, carried over from the previous Autumn page:
 * a phone that rings, connects and ends while the conversation appears in a
 * panel beside it, looping through two calls.
 *
 * `start(root)` runs it inside `root` (which holds the markup below) and
 * returns a function that stops every timer it started.
 */
export const MARKUP = "<div class=\"au2-hero-chat\" id=\"au2-hero-chat\">\n          <div class=\"au2-iphone\">\n            <div class=\"au2-iphone-btn-l1\"></div>\n            <div class=\"au2-iphone-btn-l2\"></div>\n            <div class=\"au2-iphone-btn-l3\"></div>\n            <div class=\"au2-iphone-btn-r\"></div>\n            <div class=\"au2-iphone-screen\" id=\"au2-iphone-screen\"\n              style=\"background:linear-gradient(170deg,#0c1a30 0%,#060e1e 55%,#020609 100%);\">\n              <div class=\"au2-dynamic-island\"></div>\n              <div class=\"au2-status-bar\">\n                <div class=\"au2-status-time\">12:00</div>\n                <div style=\"display:flex;align-items:center;gap:5px;\">\n                  <svg width=\"15\" height=\"11\" viewBox=\"0 0 15 11\" fill=\"white\">\n                    <rect x=\"0\"  y=\"6\"   width=\"2.8\" height=\"5\"   rx=\".6\" opacity=\".4\"/>\n                    <rect x=\"4\"  y=\"4.5\" width=\"2.8\" height=\"6.5\" rx=\".6\" opacity=\".65\"/>\n                    <rect x=\"8\"  y=\"2.5\" width=\"2.8\" height=\"8.5\" rx=\".6\" opacity=\".85\"/>\n                    <rect x=\"12\" y=\"0\"   width=\"2.8\" height=\"11\"  rx=\".6\"/>\n                  </svg>\n                  <svg width=\"13\" height=\"10\" viewBox=\"0 0 13 10\" fill=\"none\">\n                    <circle cx=\"6.5\" cy=\"9\" r=\"1.2\" fill=\"white\"/>\n                    <path d=\"M3.2 6.2a4.66 4.66 0 0 1 6.6 0\" stroke=\"white\" stroke-width=\"1.2\" stroke-linecap=\"round\"/>\n                    <path d=\"M1 3.8A8 8 0 0 1 12 3.8\" stroke=\"white\" stroke-width=\"1.2\" stroke-linecap=\"round\" opacity=\".6\"/>\n                  </svg>\n                  <svg width=\"20\" height=\"10\" viewBox=\"0 0 20 10\" fill=\"none\">\n                    <rect x=\".5\" y=\".5\" width=\"16\" height=\"9\" rx=\"2.2\" stroke=\"white\" stroke-opacity=\".5\"/>\n                    <rect x=\"1.5\" y=\"1.5\" width=\"11\" height=\"7\" rx=\"1.4\" fill=\"white\"/>\n                    <path d=\"M17.5 3.5v3a1.5 1.5 0 0 0 0-3z\" fill=\"white\" opacity=\".45\"/>\n                  </svg>\n                </div>\n              </div>\n              <div id=\"au2-iphone-ringing\" class=\"au2-iphone-ringing\">\n                <div class=\"au2-iphone-incoming\">incoming call</div>\n                <div class=\"au2-iphone-caller-avatar\">\n                  <div class=\"au2-iphone-ripple\" style=\"width:108px;height:108px;animation:au2iRingPulse 1.8s .0s ease-out infinite;\"></div>\n                  <div class=\"au2-iphone-ripple\" style=\"width:134px;height:134px;animation:au2iRingPulse 1.8s .35s ease-out infinite;\"></div>\n                  <div class=\"au2-iphone-ripple\" style=\"width:160px;height:160px;animation:au2iRingPulse 1.8s .7s ease-out infinite;\"></div>\n                  <div class=\"au2-iphone-avatar-inner\">FN</div>\n                </div>\n                <div class=\"au2-caller-name\">Fabulous Nails</div>\n                <div class=\"au2-caller-number\">+1 (619) 604-6886</div>\n                <div class=\"au2-call-btns\">\n                  <div class=\"au2-call-btn\">\n                    <div class=\"au2-call-btn-circle\" style=\"background:#dc2626;box-shadow:0 4px 16px rgba(220,38,38,.5);\">\n                      <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"transform:rotate(135deg)\"><path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"/></svg>\n                    </div>\n                    <div class=\"au2-call-btn-lbl\">Decline</div>\n                  </div>\n                  <div class=\"au2-call-btn\">\n                    <div class=\"au2-call-btn-circle\" style=\"background:#16a34a;box-shadow:0 4px 16px rgba(22,163,74,.55);animation:au2acceptPulse 1.2s ease-in-out infinite;\">\n                      <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"/></svg>\n                    </div>\n                    <div class=\"au2-call-btn-lbl\">Accept</div>\n                  </div>\n                </div>\n              </div>\n              <div id=\"au2-iphone-connected\" class=\"au2-iphone-connected\" style=\"display:none;margin-top:20px;\">\n                <div class=\"au2-iphone-name\">Fabulous Nails</div>\n                <div class=\"au2-iphone-timer\" id=\"au2-call-timer\">0:00</div>\n                <div class=\"au2-iphone-controls\">\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">M</span></div>\n                    <div class=\"au2-ctrl-lbl\">mute</div>\n                  </div>\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">#</span></div>\n                    <div class=\"au2-ctrl-lbl\">keypad</div>\n                  </div>\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">🔊</span></div>\n                    <div class=\"au2-ctrl-lbl\">speaker</div>\n                  </div>\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">➕</span></div>\n                    <div class=\"au2-ctrl-lbl\">add</div>\n                  </div>\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">📹</span></div>\n                    <div class=\"au2-ctrl-lbl\">video</div>\n                  </div>\n                                    <div class=\"au2-ctrl\">\n                    <div class=\"au2-ctrl-circle\"><span style=\"font-size:.75rem;\">👤</span></div>\n                    <div class=\"au2-ctrl-lbl\">contacts</div>\n                  </div>\n                                  </div>\n                <div class=\"au2-end-call\">\n                  <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"transform:rotate(135deg)\"><path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"/></svg>\n                </div>\n                <div class=\"au2-home-ind\"></div>\n              </div>\n            </div>\n          </div>\n          <div class=\"au2-chat-panel\">\n            <div class=\"au2-ringing-overlay\" id=\"au2-ringing-overlay\">\n              <div style=\"position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;\">\n                <div class=\"au2-ring-ripple\" style=\"width:76px;height:76px;animation:au2ringPulse 1.8s .0s ease-out infinite;\"></div>\n                <div class=\"au2-ring-ripple\" style=\"width:96px;height:96px;animation:au2ringPulse 1.8s .4s ease-out infinite;\"></div>\n                <div class=\"au2-ring-avatar\">A</div>\n              </div>\n              <div class=\"au2-ring-lbl\">Autumn is answering…</div>\n              <div class=\"au2-typing-dots\">\n                <div class=\"au2-typing-dot\" style=\"animation:au2bounce 1.1s .00s infinite;\"></div>\n                <div class=\"au2-typing-dot\" style=\"animation:au2bounce 1.1s .18s infinite;\"></div>\n                <div class=\"au2-typing-dot\" style=\"animation:au2bounce 1.1s .36s infinite;\"></div>\n              </div>\n            </div>\n            <div class=\"au2-chat-body\" id=\"au2-bubbles\"></div>\n            <div class=\"au2-chat-bar\">\n              <div class=\"au2-chat-avatar\" id=\"au2-ai-avatar\">A</div>\n              <div class=\"au2-waveform\" id=\"au2-waveform\">\n                                <div class=\"au2-wave-bar\" style=\"height:4px;animation:au2wave 0.9s 0s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:7px;animation:au2wave 0.9s 0.06s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:11px;animation:au2wave 0.9s 0.12s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:8px;animation:au2wave 0.9s 0.18s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:13px;animation:au2wave 0.9s 0.24s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:6px;animation:au2wave 0.9s 0.3s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:9px;animation:au2wave 0.9s 0.36s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:5px;animation:au2wave 0.9s 0.42s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:12px;animation:au2wave 0.9s 0.48s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:7px;animation:au2wave 0.9s 0.54s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:10px;animation:au2wave 0.9s 0.6s ease-in-out infinite alternate;\"></div>\n                                <div class=\"au2-wave-bar\" style=\"height:4px;animation:au2wave 0.9s 0.66s ease-in-out infinite alternate;\"></div>\n                              </div>\n              <div class=\"au2-chat-divider\"></div>\n              <div class=\"au2-chat-user-icon\" id=\"au2-user-icon\">👤</div>\n            </div>\n          </div>\n        </div>";

export const CSS = ".au2-hero-chat{display: flex; gap: 20px; margin-top: 18px; align-items: flex-start; height: 420px;}\n.au2-iphone{width: 178px; flex-shrink: 0; background: linear-gradient(175deg, #2c2c2e 0%, #111113 100%); border-radius: 50px; padding: 8px; box-shadow: 0 36px 90px rgba(0,0,0,.75), inset 0 0 0 1.5px rgba(255,255,255,.16), inset 0 1px 0 rgba(255,255,255,.24); position: relative; align-self: center;}\n.au2-iphone-btn-l1{position:absolute;left:-4px;top:88px; width:4px;height:22px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px;}\n.au2-iphone-btn-l2{position:absolute;left:-4px;top:122px;width:4px;height:36px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px;}\n.au2-iphone-btn-l3{position:absolute;left:-4px;top:168px;width:4px;height:36px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px;}\n.au2-iphone-btn-r{position:absolute;right:-4px;top:140px;width:4px;height:60px;background:linear-gradient(90deg,#333,#1a1a1c);border-radius:0 3px 3px 0;}\n.au2-iphone-screen{border-radius: 42px; height: 394px; display: flex; flex-direction: column; align-items: center; overflow: hidden; position: relative; transition: background 0.5s ease;}\n.au2-dynamic-island{width: 90px; height: 30px; background: #000; border-radius: 0 0 24px 24px; flex-shrink: 0;}\n.au2-status-bar{width: 100%; padding: 5px 18px 0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;}\n.au2-status-time{font-size: .7rem; color: #fff; font-weight: 700; letter-spacing: -.01em;}\n.au2-chat-panel{flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; background: #fff; border-radius: 20px; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; position: relative;}\n.au2-chat-body{flex: 1; padding: 18px 16px 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;}\n.au2-bubble-wrap-ai{display:flex; justify-content:flex-start;}\n.au2-bubble-wrap-user{display:flex; justify-content:flex-end;}\n.au2-bubble{max-width: 78%; padding: 10px 14px; font-size: .76rem; line-height: 1.55; font-weight: 500; animation: bubbleIn .25s ease;}\n.au2-bubble-ai{background: linear-gradient(135deg,#4f7fff 0%,#007AFF 100%); color: #fff; border-radius: 4px 18px 18px 18px; box-shadow: 0 2px 10px rgba(0,122,255,.25);}\n.au2-bubble-user{background: #E9E9EB; color: #1c1c1e; border-radius: 18px 4px 18px 18px; box-shadow: 0 1px 4px rgba(0,0,0,.06);}\n.au2-chat-bar{flex-shrink: 0; border-top: 1px solid #f0f0f0; padding: 10px 16px; display: flex; align-items: center; gap: 10px; background: #fafafa;}\n.au2-chat-avatar{width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: .72rem; transition: opacity .4s;}\n.au2-waveform{display:flex; align-items:center; gap:2px; transition: opacity .4s;}\n.au2-wave-bar{width: 3px; border-radius: 2px; background: var(--violet);}\n.au2-chat-divider{flex:1; border-top: 1.5px dotted #e0e0e0; align-self: center;}\n.au2-chat-user-icon{width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: #E9E9EB; display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 700; color: #555; transition: opacity .4s;}\n.au2-ringing-overlay{position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,.97); backdrop-filter: blur(6px); gap: 10px;}\n.au2-ring-avatar{width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1rem; box-shadow: 0 4px 16px rgba(109,40,217,.35); position: relative; z-index: 1;}\n.au2-ring-lbl{font-size: .8rem; font-weight: 600; color: #6b7280;}\n.au2-typing-dots{display: flex; gap: 5px;}\n.au2-typing-dot{width: 6px; height: 6px; border-radius: 50%; background: var(--violet); opacity: 0.45;}\n.au2-ring-ripple{position: absolute; border-radius: 50%; border: 1.5px solid rgba(109,40,217,.22);}\n.au2-iphone-ringing{display: flex; flex-direction: column; align-items: center; width: 100%; flex: 1; padding-top: 6px;}\n.au2-iphone-incoming{font-size: .68rem; color: rgba(255,255,255,.55); font-weight: 500; letter-spacing: .06em; margin-bottom: 18px; text-align: center;}\n.au2-iphone-caller-avatar{position: relative; width: 82px; height: 82px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px;}\n.au2-iphone-ripple{position: absolute; border-radius: 50%; border: 1.5px solid rgba(52,211,153,.4);}\n.au2-iphone-avatar-inner{width: 74px; height: 74px; border-radius: 50%; background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,.15); z-index: 1;}\n.au2-caller-name{font-size: 1rem; color: #fff; font-weight: 700; text-align: center; line-height: 1.2; margin-bottom: 4px;}\n.au2-caller-number{font-size: .65rem; color: rgba(255,255,255,.4); margin-bottom: 26px;}\n.au2-call-btns{display: flex; gap: 36px; align-items: center;}\n.au2-call-btn{display: flex; flex-direction: column; align-items: center; gap: 6px;}\n.au2-call-btn-circle{width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center;}\n.au2-call-btn-lbl{font-size: .6rem; color: rgba(255,255,255,.5);}\n.au2-iphone-connected{display: flex; flex-direction: column; align-items: center; width: 100%; flex: 1;}\n.au2-iphone-name{font-size: 1.15rem; color: #fff; font-weight: 700; letter-spacing: -.02em; text-align: center; margin-bottom: 6px;}\n.au2-iphone-timer{font-size: .75rem; color: rgba(255,255,255,.5); font-variant-numeric: tabular-nums; letter-spacing: .04em; margin-bottom: 16px;}\n.au2-iphone-controls{display: grid; grid-template-columns: repeat(3,1fr); row-gap: 10px; column-gap: 6px; padding: 0 12px; margin-bottom: 16px; width: 100%;}\n.au2-ctrl{display: flex; flex-direction: column; align-items: center; gap: 4px;}\n.au2-ctrl-circle{width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center;}\n.au2-ctrl-lbl{font-size: .5rem; color: rgba(255,255,255,.55); text-align: center;}\n.au2-end-call{width: 50px; height: 50px; border-radius: 50%; background: #e5373a; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(229,55,58,.65);}\n.au2-home-ind{position: absolute; bottom: 8px; width: 110px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.35);}\n@media (max-width: 900px){.au2-hero-chat{display: none;}}\n@keyframes bubbleIn{from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; }}\n@keyframes au2wave{from { transform: scaleY(.35); } to { transform: scaleY(1.4); }}\n@keyframes au2ringPulse{0% { transform: scale(.85); opacity: .8; } 70% { transform: scale(1.35); opacity: 0; } 100% { transform: scale(1.35); opacity: 0; }}\n@keyframes au2acceptPulse{0%, 100% { box-shadow: 0 3px 14px rgba(22,163,74,.55); } 50% { box-shadow: 0 3px 22px rgba(22,163,74,.9); }}\n@keyframes au2bounce{0%, 80%, 100% { transform: translateY(0); opacity: .55; } 40% { transform: translateY(-5px); opacity: 1; }}\n@keyframes au2iRingPulse{0% { transform: scale(.85); opacity: .8; } 70% { transform: scale(1.4); opacity: 0; } 100% { transform: scale(1.4); opacity: 0; }}";

export function start(root) {
  var timeouts = [], intervals = [], stopped = false;
  function setTimeout(fn, ms) { var id = window.setTimeout(function () { if (!stopped) fn(); }, ms); timeouts.push(id); return id; }
  function setInterval(fn, ms) { var id = window.setInterval(function () { if (!stopped) fn(); }, ms); intervals.push(id); return id; }
  function clearInterval(id) { window.clearInterval(id); }

  var SCENARIOS = [
    [
      { from:'autumn', text:'Thank you for calling Fabulous Nails! This is Autumn. How can I help you today?' },
      { from:'client', text:'Hi! I\'d like to book a gel manicure this Wednesday.' },
      { from:'autumn', text:'Perfect — Wednesday at 3:00 PM with Lily is open. Want me to book that for you?' }
    ],
    [
      { from:'client', text:'Hi, I need to reschedule my Thursday appointment.' },
      { from:'autumn', text:'Of course! I can help with that. What\'s the name on the booking?' },
      { from:'client', text:'It\'s Sarah Johnson.' },
      { from:'autumn', text:'Got it, Sarah — moved you to Saturday at 10:00 AM. Confirmation text on its way!' }
    ]
  ];
  var DELAYS_A = [800,4200,7800], LOOP_A = 12000;
  var DELAYS_B = [800,4000,7200,10800], LOOP_B = 15000;
  var RING_MS = 2400, SWEEP_MS = 900;

  var scenIdx = 0, loopTimer, phase = 'ringing', callSecs = 0, callTimer;
  var bubblesEl   = root.querySelector('#au2-bubbles');
  var ringOverlay = root.querySelector('#au2-ringing-overlay');
  var iRinging    = root.querySelector('#au2-iphone-ringing');
  var iConnected  = root.querySelector('#au2-iphone-connected');
  var iScreen     = root.querySelector('#au2-iphone-screen');
  var callTimerEl = root.querySelector('#au2-call-timer');
  var connectedHtml = iConnected.innerHTML;
  var waveEl      = root.querySelector('#au2-waveform');
  var aiAvatar    = root.querySelector('#au2-ai-avatar');
  var userIcon    = root.querySelector('#au2-user-icon');

  function fmtSecs(s) {
    return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);
  }

  function setPhase(p) {
    phase = p;
    if (p === 'ringing') {
      iScreen.style.background = 'linear-gradient(170deg,#0c1a30 0%,#060e1e 55%,#020609 100%)';
      iConnected.innerHTML = connectedHtml;
      callTimerEl = root.querySelector('#au2-call-timer');
      if (callTimerEl) callTimerEl.textContent = '0:00';
      iRinging.style.display = 'flex';
      iConnected.style.display = 'none';
      ringOverlay.style.display = 'flex';
      bubblesEl.innerHTML = '';
      if (callTimer) clearInterval(callTimer);
      callSecs = 0;
    } else if (p === 'connected') {
      iScreen.style.background = 'linear-gradient(170deg,#1a0838 0%,#0a031a 45%,#040110 100%)';
      iRinging.style.display = 'none';
      iConnected.style.display = 'flex';
      ringOverlay.style.opacity = '0';
      ringOverlay.style.transition = 'opacity .35s';
      setTimeout(function(){ ringOverlay.style.display='none'; ringOverlay.style.opacity=''; ringOverlay.style.transition=''; }, 380);
      callTimer = setInterval(function(){ callSecs++; if(callTimerEl) callTimerEl.textContent=fmtSecs(callSecs); }, 1000);
    } else if (p === 'sweeping') {
      iScreen.style.background = 'linear-gradient(180deg,#0a0a0a 0%,#050505 100%)';
      iConnected.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;gap:8px;margin-top:40px;">' +
        '<div style="width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:rgba(255,255,255,.25);">FN</div>' +
        '<div style="font-size:.88rem;color:rgba(255,255,255,.85);font-weight:600;">Autumn handled the call</div>' +
        '<div style="font-size:.7rem;color:rgba(255,255,255,.38);">Preparing the next demo…</div></div>';
      bubblesEl.style.transition = 'transform .55s ease-in, opacity .55s';
      bubblesEl.style.transform = 'translateY(-420px)';
      bubblesEl.style.opacity = '0';
      if (callTimer) clearInterval(callTimer);
    }
  }

  function addBubble(msg) {
    var isAI = msg.from === 'autumn';
    var wrap = document.createElement('div');
    wrap.className = isAI ? 'au2-bubble-wrap-ai' : 'au2-bubble-wrap-user';
    var bbl = document.createElement('div');
    bbl.className = 'au2-bubble ' + (isAI ? 'au2-bubble-ai' : 'au2-bubble-user');
    bbl.textContent = msg.text;
    wrap.appendChild(bbl);
    bubblesEl.appendChild(wrap);
    bubblesEl.scrollTop = bubblesEl.scrollHeight;
    // speaker indicators
    if (aiAvatar) aiAvatar.style.opacity = isAI ? '1' : '0.35';
    if (userIcon) userIcon.style.opacity = isAI ? '0.35' : '1';
    if (waveEl)   waveEl.style.opacity   = isAI ? '1' : '0.2';
  }

  function runLoop() {
    var msgs   = SCENARIOS[scenIdx];
    var delays = scenIdx === 0 ? DELAYS_A : DELAYS_B;
    var loopMs = scenIdx === 0 ? LOOP_A   : LOOP_B;

    // Reset bubble panel
    bubblesEl.style.transition = '';
    bubblesEl.style.transform  = '';
    bubblesEl.style.opacity    = '1';
    bubblesEl.innerHTML = '';
    if (aiAvatar) aiAvatar.style.opacity = '1';
    if (userIcon) userIcon.style.opacity = '0.35';
    if (waveEl)   waveEl.style.opacity   = '1';

    setPhase('ringing');

    setTimeout(function() { setPhase('connected'); }, RING_MS);

    delays.forEach(function(d, i) {
      setTimeout(function() { if(msgs[i]) addBubble(msgs[i]); }, RING_MS + d);
    });

    setTimeout(function() { setPhase('sweeping'); }, RING_MS + loopMs);

    loopTimer = setTimeout(function() {
      scenIdx = (scenIdx + 1) % SCENARIOS.length;
      runLoop();
    }, RING_MS + loopMs + SWEEP_MS);
  }
  runLoop();

  return function stop() {
    stopped = true;
    timeouts.forEach(function (id) { window.clearTimeout(id); });
    intervals.forEach(function (id) { window.clearInterval(id); });
  };
}
