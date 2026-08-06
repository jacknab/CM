/**
 * ConfirmRoot — mount once in the app root (App.tsx).
 * Renders the global confirm / alert dialog driven by the imperative API in
 * @/lib/confirm. No additional context provider required.
 */
import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type ConfirmState, _subscribeConfirm, _resolveConfirm } from "@/lib/confirm";

const CLOSED: ConfirmState = {
  open: false,
  message: "",
  title: "",
  confirmLabel: "",
  cancelLabel: "",
  destructive: false,
  mode: "confirm",
};

export function ConfirmRoot() {
  const [state, setState] = useState<ConfirmState>(CLOSED);

  useEffect(() => _subscribeConfirm(setState), []);

  const handleConfirm = () => _resolveConfirm(true);
  const handleCancel = () => _resolveConfirm(false);

  return (
    <AlertDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) _resolveConfirm(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.message && (
            <AlertDialogDescription>{state.message}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {state.mode === "confirm" && (
            <AlertDialogCancel onClick={handleCancel}>
              {state.cancelLabel}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              state.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {state.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
