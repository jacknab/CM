import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Last Cut Formula sheets (editor, history, references) render on top of the page, not inside the popup that opened
 * them: a popup's opening animation can leave a transform that would trap a fixed sheet inside its card. Without a
 * page (server rendering, tests) the sheet renders in place.
 */
export function LcfPortal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? <>{children}</> : createPortal(children, document.body);
}
