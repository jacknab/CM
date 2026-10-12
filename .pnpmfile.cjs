/**
 * drizzle-orm lists a driver for every database it can talk to as an optional peer, expo-sqlite among
 * them. The Android app (apps/certxa-owner) uses expo-sqlite for its own on-device database, and with it
 * anywhere in the workspace pnpm would wire it into drizzle-orm for every package — a second copy of
 * drizzle-orm's types, an Expo release nobody asked for, and hundreds of type errors in the web app.
 * The server talks to Postgres only, so that peer is removed here.
 */
function readPackage(pkg) {
  if (pkg.name === "drizzle-orm") {
    if (pkg.peerDependencies) delete pkg.peerDependencies["expo-sqlite"];
    if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta["expo-sqlite"];
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
