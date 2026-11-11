/**
 * AspenTheme — the "Aspen" website (owner, 2026-11-07): the Solo design whose booking starts with a Staff step:
 * "Anyone available" first, then everyone who does the services chosen. It also shows the chat bubble and has no
 * Visit Us section. Everything else is Solo's; the server treats both designs the same
 * (lib/soloCategoryPages.ts isSoloDesign).
 *
 * Since 2026-11-11 (plans/ai-site-widgets.md) it is Solo's widget layout (SoloTheme.tsx SoloLayout) with design "aspen".
 */
import { SoloLayout } from "./SoloTheme";
import type { BloomThemeProps } from "./widgets/shared";

export default function AspenTheme(props: BloomThemeProps) {
  return <SoloLayout {...props} design="aspen" />;
}
