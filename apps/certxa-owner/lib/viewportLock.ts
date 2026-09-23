/**
 * viewportLock.ts — JavaScript injected into the portal WebView so the page can never zoom
 * or drift. Tablets render the desktop layout at 1280 CSS px, so the viewport scale is pinned
 * to screenWidth/1280 (max 1): the page fits the screen exactly and cannot be dragged sideways,
 * pinch-zoomed or double-tap-zoomed. (The web app applies the same lock itself — see
 * artifacts/booking/src/lib/nativeViewportLock.ts — this just gets it right from first paint.)
 *
 * `initialScreenWidth` (the RN-measured width at inject time) is only a SEED for the very first
 * frame, before the WebView's own `window.screen.width` is necessarily reliable. From then on the
 * injected script re-measures and re-applies itself on resize/orientationchange — it was
 * previously a one-shot lock computed solely from the RN value, so a stale/early measurement (or
 * a later rotation) could leave the page mis-scaled for the rest of the session on some devices,
 * producing a squeezed layout that never corrected itself. This mirrors nativeViewportLock.ts's
 * own resize handling so both the pre-hydration and post-hydration lock behave identically.
 */
const TABLET_LAYOUT_WIDTH = 1280;
const TABLET_MIN_SCREEN_WIDTH = 768;

export function viewportContent(screenWidth: number): string {
  if (screenWidth >= TABLET_MIN_SCREEN_WIDTH) {
    const s = Math.min(1, screenWidth / TABLET_LAYOUT_WIDTH);
    const scale = (Math.round(s * 10000) / 10000).toString();
    return `width=${TABLET_LAYOUT_WIDTH}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no`;
  }
  return 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
}

export function viewportLockJs(initialScreenWidth: number): string {
  const seed = JSON.stringify(viewportContent(initialScreenWidth));
  return `
(function() {
  function content() {
    var w = (window.screen && window.screen.width) || window.innerWidth || ${JSON.stringify(initialScreenWidth)};
    if (w >= ${TABLET_MIN_SCREEN_WIDTH}) {
      var s = Math.min(1, w / ${TABLET_LAYOUT_WIDTH});
      s = Math.round(s * 10000) / 10000;
      return 'width=${TABLET_LAYOUT_WIDTH}, initial-scale=' + s + ', minimum-scale=' + s + ', maximum-scale=' + s + ', user-scalable=no';
    }
    return 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
  }
  function apply() {
    var head = document.head || document.documentElement;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; head.appendChild(meta); }
    // Before the DOM/window are ready to self-measure, fall back to the RN-seeded value.
    meta.setAttribute('content', (document.readyState === 'loading') ? ${seed} : content());
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  if (!window.__certxaLockInstalled) {
    window.__certxaLockInstalled = true;
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    var st = document.createElement('style');
    st.textContent = 'html,body{touch-action:pan-x pan-y;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}html{overflow-x:hidden}';
    (document.head || document.documentElement).appendChild(st);
    ['gesturestart','gesturechange','gestureend'].forEach(function(t){
      document.addEventListener(t, function(e){ e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('touchmove', function(e){
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
  }
})();
true;
`;
}
