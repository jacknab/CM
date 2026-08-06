/**
 * Stub for react-native-ping.
 *
 * react-native-thermal-receipt-printer-image-qr imports this module only for
 * its WiFi/network printer discovery path (net-connect.js). Certxa uses
 * Bluetooth and USB printers exclusively, so this code path is never executed.
 *
 * We stub the module here so Metro can bundle without the native module being
 * present, rather than adding a native dependency we will never call.
 */
export default {
  ping: () => Promise.reject(new Error('WiFi printing is not supported')),
};
