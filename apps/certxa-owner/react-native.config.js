/**
 * react-native-worklets is only present because expo-router lists
 * react-native-reanimated as an optional peer dependency, and pnpm's
 * workspace resolution pulls in the real version another app (certxa-terminal,
 * on React Native 0.86) provides for it. This app doesn't use reanimated or
 * worklets anywhere in its own code, and worklets' podspec hard-requires
 * React Native 0.83-0.86 — incompatible with this app's 0.81.5 — which
 * otherwise fails the "Install pods" build step. Excluding it from
 * autolinking here stops CocoaPods from ever evaluating that podspec.
 */
module.exports = {
  dependencies: {
    'react-native-worklets': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
