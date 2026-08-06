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

config.resolver.unstable_enablePackageExports = false;

config.watchman = {
  ...(config.watchman || {}),
};

config.watcher = {
  ...(config.watcher || {}),
  additionalExts: config.watcher?.additionalExts || [],
  watchman: config.watcher?.watchman || {},
};

config.resolver.blockList = [
  /.*\/node_modules\/.vite\/.*/,
  /.*\/\.vite\/.*/,
  /.*\/node_modules\/\.vite.*/,
  // Exclude Android native resource trees — Metro doesn't need to watch them
  // and they consume thousands of inotify watchers on Replit (ENOSPC).
  /.*\/ReactAndroid\/.*/,
  /.*\/react-native\/android\/.*/,
  /.*\/\.gradle\/.*/,
];

module.exports = config;
