/**
 * The installed APK's version and build number, shown small in the bottom-right corner of /nail (white),
 * /frontdesk and /kiosk (grey) so anyone can see which build a tablet runs.
 *
 * UPDATE BOTH WITH EVERY APK BUILD (owner's request, 2026-10-17):
 *  - APP_VERSION = `version` in app.json (bumped whenever native code changes).
 *  - APP_BUILD   = the Android build number EAS gives the build. EAS counts it up by itself
 *    (appVersionSource "remote"): before `eas build`, set this to the current number + 1
 *    (`eas build:version:get -p android`), or set it right after the build and send it as an update.
 * An over-the-air update carries this file, so it must always describe the APK the update is for.
 */
export const APP_VERSION = '1.0.4';
export const APP_BUILD = 24;
export const APP_BUILD_LABEL = `v${APP_VERSION} · build ${APP_BUILD}`;
