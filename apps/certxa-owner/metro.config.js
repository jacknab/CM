const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Two levels up: apps/certxa-owner → apps → workspace root
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace support: tell Metro to look in the workspace root's
// node_modules so symlinked packages resolve correctly on EAS.
// watchFolders is intentionally NOT overridden — Expo's defaults must stay
// intact for its internal tooling to work correctly.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// @/ path alias — mirrors tsconfig.json "paths": { "@/*": ["./*"] }
// We resolve it explicitly here so the alias works on EAS even when
// Expo's tsconfig-based resolver is bypassed by the workspace layout.
const expoResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // @/ path alias — mirrors tsconfig.json "paths": { "@/*": ["./*"] }
  if (moduleName.startsWith('@/')) {
    const absolutePath = path.resolve(projectRoot, moduleName.slice(2));
    return context.resolveRequest(context, absolutePath, platform);
  }

  // Stub react-native-ping: only used by the WiFi printer path inside
  // react-native-thermal-receipt-printer-image-qr. We use BLE/USB only.
  if (moduleName === 'react-native-ping') {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'stubs/react-native-ping.js') };
  }

  if (expoResolveRequest) {
    return expoResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Fixes @tanstack/query-core Hermes crash in Expo SDK 54 / RN 0.81:
// Force Metro to use the legacy CJS build instead of the package exports
// field which points at the modern build using private class fields.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
