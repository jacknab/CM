import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * FormRow — shared layout primitive for form fields.
 *
 * On mobile: children stack vertically (one per row).
 * On sm+ (640px+): children sit side-by-side in equal columns.
 *
 * Usage:
 *   <FormRow>
 *     <div><Label>First name</Label><Input .../></div>
 *     <div><Label>Last name</Label><Input .../></div>
 *   </FormRow>
 *
 * Pass `cols={3}` to get a 3-column desktop layout (default is 2).
 * Pass `className` to override the container.
 */
export function FormRow({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass: Record<number, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
  };
  return (
    <div className={cn("grid grid-cols-1 gap-4", colClass[cols] ?? "sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}
