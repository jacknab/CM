// Ambient declaration for Node-style process.env used in Expo (EXPO_PUBLIC_*)
// This avoids needing @types/node (which conflicts with React Native types).
declare const process: {
  env: Record<string, string | undefined>;
};
