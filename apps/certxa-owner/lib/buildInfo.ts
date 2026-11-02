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
 *
 * APP_UPDATE: the date of the over-the-air update the tablet runs (owner, 2026-11-02) — SET IT BEFORE EVERY
 * `eas update` (MM-DD). The version stays the APK's: changing `version` in app.json would stop updates reaching
 * tablets that have the current APK. Empty right after a new APK build (no update on top of it yet).
 */
export const APP_VERSION = '1.0.4';
export const APP_BUILD = 25;
export const APP_UPDATE = '11-02';
export const APP_BUILD_LABEL = `v${APP_VERSION} · build ${APP_BUILD}${APP_UPDATE ? ` · update ${APP_UPDATE}` : ''}`;
