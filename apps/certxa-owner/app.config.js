/**
 * One codebase, one Android app per business type (plans/certxa-apps.md). app.json is the full Certxa
 * app ("owner"); APP_PROFILE=<id> at build time turns it into that profile's app: its own name, package
 * ID and update channel, opening the web app with ?app=<id> so the web side limits itself to that
 * profile's screens (shared/appProfiles.ts — keep the ids the same).
 *
 *   APP_PROFILE=nail eas build --platform android --profile nail-preview
 *
 * Hardware support (card reader, printers, cash drawer), offline mode, the local hub and kiosk lock are
 * shared by every profile unchanged.
 */
const PROFILES = {
  // "Certxa Nail" is a placeholder until the owner chooses the name. Every app uses the Certxa icon in
  // app.json (assets/icon.png, made from assets/icon-design.png) unless its profile sets its own.
  nail: { name: 'Certxa Nail', androidPackage: 'com.certxa.nail', scheme: 'certxa-nail' },
};

module.exports = ({ config }) => {
  const id = process.env.APP_PROFILE;
  if (!id || id === 'owner') return config; // the full Certxa app: app.json as it is
  const profile = PROFILES[id];
  if (!profile) throw new Error(`APP_PROFILE "${id}" is not one of: owner, ${Object.keys(PROFILES).join(', ')}`);
  return {
    ...config,
    name: profile.name,
    scheme: profile.scheme,
    icon: profile.icon ?? config.icon,
    android: {
      ...config.android,
      package: profile.androidPackage,
      ...(profile.adaptiveIcon
        ? { adaptiveIcon: { ...config.android?.adaptiveIcon, foregroundImage: profile.adaptiveIcon, backgroundColor: profile.iconBackground } }
        : {}),
    },
    extra: { ...config.extra, appProfile: id },
  };
};
