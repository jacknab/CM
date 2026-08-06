/**
 * withJitpack.js — Expo config plugin
 *
 * Adds the JitPack maven repository to the Android project build.gradle.
 * Required by react-native-thermal-receipt-printer-image-qr which depends on
 * com.github.DantSu:ESCPOS-ThermalPrinter-Android via JitPack.
 */
// Resolve @expo/config-plugins through expo's own package directory.
// This is required for pnpm monorepos where the package isn't hoisted to the
// project root — EAS build servers use strict isolation so bare requires fail.
const path = require('path');
const expoDir = path.dirname(require.resolve('expo/package.json'));
const { withProjectBuildGradle } = require(
  require.resolve('@expo/config-plugins', { paths: [expoDir] })
);

module.exports = function withJitpack(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('jitpack.io')) return config; // idempotent

    // Insert JitPack after the google() repo inside allprojects > repositories
    config.modResults.contents = contents.replace(
      /(allprojects\s*\{[^}]*repositories\s*\{[^}]*)(google\s*\(\s*\))/,
      (match, prefix, google) =>
        `${prefix}${google}\n        maven { url 'https://jitpack.io' }`,
    );

    // Fallback: if the pattern didn't match (SDK50+ flat structure), try the
    // dependencyResolutionManagement block used in newer Expo templates
    if (!config.modResults.contents.includes('jitpack.io')) {
      config.modResults.contents = config.modResults.contents.replace(
        /(dependencyResolutionManagement[^}]*repositories\s*\{[^}]*)(google\s*\(\s*\))/,
        (match, prefix, google) =>
          `${prefix}${google}\n        maven { url 'https://jitpack.io' }`,
      );
    }

    return config;
  });
};
