/**
 * Imperative confirm / alert API.
 * Replaces native window.confirm / window.alert with a proper UI dialog.
 *
 * Usage (inside async functions / event handlers):
 *   import { confirm, appAlert } from "@/lib/confirm";
 *
 *   if (await confirm("Delete this item?", { destructive: true })) { ... }
 *   await appAlert("Settings saved successfully.");
 *
 * The singleton ConfirmRoot component must be mounted once in the app tree
 * (App.tsx already does this). No React context provider is required.
 */

export type ConfirmMode = "confirm" | "alert";

export type ConfirmState = {
  open: boolean;
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  mode: ConfirmMode;
};

export type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Listener = (state: ConfirmState) => void;

const CLOSED: ConfirmState = {
  open: false,
  message: "",
  title: "",
  confirmLabel: "",
  cancelLabel: "",
  destructive: false,
  mode: "confirm",
};

let _listener: Listener | null = null;
let _resolve: ((val: boolean) => void) | null = null;

/** Called by ConfirmRoot to receive state updates. */
export function _subscribeConfirm(l: Listener): () => void {
  _listener = l;
  return () => {
    if (_listener === l) _listener = null;
  };
}

/** Called by ConfirmRoot when the user clicks Confirm or Cancel. */
export function _resolveConfirm(val: boolean): void {
  _resolve?.(val);
  _resolve = null;
  _listener?.(CLOSED);
}

/** Show a confirm dialog. Returns true when the user clicks the confirm button. */
export function confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    _resolve = resolve;
    _listener?.({
      open: true,
      message,
      title: opts?.title ?? "Are you sure?",
      confirmLabel: opts?.confirmLabel ?? "Confirm",
      cancelLabel: opts?.cancelLabel ?? "Cancel",
      destructive: opts?.destructive ?? false,
      mode: "confirm",
    });
  });
}

/** Show an alert dialog (single OK button). Resolves when the user clicks OK. */
export function appAlert(message: string, title = "Notice"): Promise<void> {
  return new Promise<void>((resolve) => {
    _resolve = () => resolve();
    _listener?.({
      open: true,
      message,
      title,
      confirmLabel: "OK",
      cancelLabel: "",
      destructive: false,
      mode: "alert",
    });
  });
}
