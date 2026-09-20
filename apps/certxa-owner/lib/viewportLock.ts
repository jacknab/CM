/**
 * viewportLock.ts — JavaScript injected into the portal WebView so the page can never zoom
 * or drift. Tablets render the desktop layout at 1280 CSS px, so the viewport scale is pinned
 * to screenWidth/1280 (max 1): the page fits the screen exactly and cannot be dragged sideways,
 * pinch-zoomed or double-tap-zoomed. (The web app applies the same lock itself — see
 * artifacts/booking/src/lib/nativeViewportLock.ts — this just gets it right from first paint.)
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

export function viewportLockJs(screenWidth: number): string {
  const content = JSON.stringify(viewportContent(screenWidth));
  return `
(function() {
  function apply() {
    var head = document.head || document.documentElement;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; head.appendChild(meta); }
    meta.setAttribute('content', ${content});
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  if (!window.__certxaLockInstalled) {
    window.__certxaLockInstalled = true;
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
