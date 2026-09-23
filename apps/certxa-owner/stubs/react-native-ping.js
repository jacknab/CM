/**
 * Stub for react-native-ping.
 *
 * react-native-thermal-receipt-printer-image-qr's net-connect.js calls Ping.start(ip, {timeout}) as a
 * pre-flight reachability check before opening the real ESC/POS TCP socket (RNNetPrinterModule.connectPrinter).
 * We don't want the native ICMP-ping dependency just for that pre-check — connectPrinter() immediately after
 * does its own real socket connect and reports its own error if the printer isn't reachable, so resolving
 * here unconditionally (skipping the ping) is safe: it just means a dead host fails at the socket-connect
 * step instead of one step earlier.
 */
export default {
  start: () => Promise.resolve(0),
};
