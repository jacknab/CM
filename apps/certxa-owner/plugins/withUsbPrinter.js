/**
 * withUsbPrinter — lets Android remember USB permission for the receipt printer.
 *
 * Declares USB host support and a USB_DEVICE_ATTACHED filter for thermal-receipt-printer
 * makers (plus USB printer class 7). With this, plugging the printer in makes Android offer
 * "Open Certxa?" with a "Use by default for this USB device" box — after that the permission
 * is remembered and printing needs no prompt. Printing still works without it (the app asks
 * for USB permission itself), this just removes the repeated prompt.
 */
const fs = require('fs');
const path = require('path');
// Resolve @expo/config-plugins through expo's own package directory (pnpm strict isolation on
// EAS build servers makes a bare require fail) — same approach as withJitpack.js.
const expoDir = path.dirname(require.resolve('expo/package.json'));
const { withAndroidManifest, withDangerousMod } = require(
  require.resolve('@expo/config-plugins', { paths: [expoDir] })
);

const ACTION = 'android.hardware.usb.action.USB_DEVICE_ATTACHED';
// Decimal vendor ids of common POS receipt printers — keep in sync with lib/usbPrinterPick.ts.
const VENDOR_IDS = [1208, 1305, 5380, 7568, 3540, 5455, 1155, 1046, 1110, 10473, 4070, 8137, 26728, 19267];

const FILTER_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <usb-device class="7" />
${VENDOR_IDS.map((v) => `    <usb-device vendor-id="${v}" />`).join('\n')}
</resources>
`;

module.exports = function withUsbPrinter(config) {
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;

    manifest['uses-feature'] = manifest['uses-feature'] || [];
    if (!manifest['uses-feature'].some((f) => f.$['android:name'] === 'android.hardware.usb.host')) {
      manifest['uses-feature'].push({ $: { 'android:name': 'android.hardware.usb.host', 'android:required': 'false' } });
    }

    const app = manifest.application && manifest.application[0];
    const main = app && (app.activity || []).find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return c;

    main['intent-filter'] = main['intent-filter'] || [];
    const hasFilter = main['intent-filter'].some((f) => (f.action || []).some((a) => a.$['android:name'] === ACTION));
    if (!hasFilter) main['intent-filter'].push({ action: [{ $: { 'android:name': ACTION } }] });

    main['meta-data'] = main['meta-data'] || [];
    if (!main['meta-data'].some((m) => m.$['android:name'] === ACTION)) {
      main['meta-data'].push({ $: { 'android:name': ACTION, 'android:resource': '@xml/usb_device_filter' } });
    }
    return c;
  });

  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'usb_device_filter.xml'), FILTER_XML);
      return c;
    },
  ]);

  return config;
};
