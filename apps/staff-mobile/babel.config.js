module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // No extra plugins needed.
    //
    // Private class field / private method transforms (@babel/plugin-transform-class-properties,
    // @babel/plugin-transform-private-methods) were previously listed here to work around
    // SyntaxError crashes in older Hermes. They are NOT installed as explicit deps and
    // caused "Cannot find module" Babel errors in Metro dev mode.
    //
    // The real fix lives in metro.config.js:
    //   config.resolver.unstable_enablePackageExports = false
    // This forces Metro to resolve @tanstack/query-core via the `main` field (the legacy
    // Hermes-safe CJS build) instead of the package's `exports` field (which points at
    // the modern build that uses private class fields).  React Native 0.81 / Hermes 0.14+
    // supports private class fields natively, so no Babel transform is needed at all.
  };
};
