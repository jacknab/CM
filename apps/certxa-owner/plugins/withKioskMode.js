/**
 * withKioskMode — the manifest side of the tablet kiosk lock (native code: modules/certxa-app-restart).
 *
 *  • A HOME + DEFAULT intent filter on MainActivity (alongside the normal LAUNCHER one), so Certxa
 *    can be the tablet's Home app: Android reopens it whenever its process ends — after the nightly
 *    self-restart, an unexpected crash, or a reboot — and the Home button returns to it.
 *  • lockTaskMode="if_whitelisted": on a tablet provisioned with Certxa as device owner, the app
 *    enters Android's kiosk lock (Lock Task mode) by itself every time it starts, with no prompt.
 *    On any other tablet this attribute does nothing.
 */
const path = require('path');
// Resolve @expo/config-plugins through expo's own package directory (pnpm strict isolation on
// EAS build servers makes a bare require fail) — same approach as withUsbPrinter.js.
const expoDir = path.dirname(require.resolve('expo/package.json'));
const { withAndroidManifest } = require(require.resolve('@expo/config-plugins', { paths: [expoDir] }));

const HOME = 'android.intent.category.HOME';

module.exports = function withKioskMode(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application && c.modResults.manifest.application[0];
    const main = app && (app.activity || []).find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return c;

    main.$['android:lockTaskMode'] = 'if_whitelisted';

    main['intent-filter'] = main['intent-filter'] || [];
    const hasHome = main['intent-filter'].some((f) => (f.category || []).some((cat) => cat.$['android:name'] === HOME));
    if (!hasHome) {
      main['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': HOME } },
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        ],
      });
    }
    return c;
  });
};
