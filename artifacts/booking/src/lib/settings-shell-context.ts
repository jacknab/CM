import { createContext, useContext } from "react";

/**
 * True when a settings page is being rendered inside the macOS-style
 * SettingsShell detail pane (rather than as its own full route).
 *
 * `AppLayout` reads this: inside the shell it collapses to a bare wrapper —
 * no app sidebar, no page container, no mobile-nav spacer — so each existing
 * settings page can be mounted in the pane without doubling the chrome.
 */
export const SettingsShellContext = createContext(false);

export const useInSettingsShell = () => useContext(SettingsShellContext);
