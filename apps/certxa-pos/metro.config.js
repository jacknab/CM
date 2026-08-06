const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Disable package exports resolution so Metro uses the `main` field instead.
// @tanstack/query-core v5 exports point to the modern build which uses private
// class fields (#x syntax) — Hermes cannot parse these. The `main` field
// already points to build/legacy/index.cjs which is Hermes-safe.
config.resolver.unstable_enablePackageExports = false;

config.resolver.blockList = [
  /.*\/node_modules\/.vite\/.*/,
  /.*\/\.vite\/.*/,
  /.*\/node_modules\/\.vite.*/,
  /.*\/\.cache\/.*/,
  // Exclude Replit agent skill temp artifacts — Metro crashes if it watches
  // a directory that gets deleted mid-session.
  /.*\/\.local\/skills\/.*/,
  // Exclude the massive React Native debugger-frontend tree — it has thousands
  // of files and pushes inotify over the system limit (ENOSPC).
  /.*\/@react-native\/debugger-frontend\/.*/,
  /.*\/@react-native\/debugger-shell\/.*/,
];

// Exclude hidden/cache dirs from watch to avoid dotslash temp-path crashes
config.watchFolders = config.watchFolders || [];
config.watcher = {
  ...(config.watcher || {}),
  watchman: {
    ...(config.watcher?.watchman || {}),
    deferStates: [],
  },
};

module.exports = config;
