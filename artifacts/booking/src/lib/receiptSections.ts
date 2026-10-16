/**
 * A Group Pay receipt lists every ticket paid together, each under its technician's name:
 *
 *   --- -- CINDY LANE ------------
 *   S 1 French Pedicure     $45.00
 *   --- -- TOM LAM ---------------
 *   S 1 Spa Pedicure        $55.00
 *
 * A receipt line carries `section` (the technician heading it goes under) only on a Group Pay sale; a
 * one-ticket receipt has none and is shown as before. `kind`: "product" for retail (P), "tip" for the ticket's
 * share of the tip (shown as "Tip"; the whole tip is still in the totals), otherwise a service (S).
 * The Android app prints the same layout (apps/certxa-owner/lib/receiptText.ts).
 */
export interface ReceiptLine { label: string; price: number; section?: string; kind?: "service" | "product" | "tip" }

export interface ReceiptSection { title: string | null; lines: ReceiptLine[] }

/** Consecutive lines under the same heading, in order. One untitled section when the receipt has no headings. */
export function receiptSections(items: ReceiptLine[]): ReceiptSection[] {
  const out: ReceiptSection[] = [];
  for (const item of items) {
    const title = item.section ?? null;
    const last = out[out.length - 1];
    if (last && last.title === title) last.lines.push(item);
    else out.push({ title, lines: [item] });
  }
  return out;
}

/** "S 1 Gel Polish" / "P 1 Cuticle Oil": an add-on's "+ " is dropped, as each line already stands on its own. */
export function sectionLineLabel(item: ReceiptLine): string {
  if (item.kind === "tip") return "    Tip";
  return `${item.kind === "product" ? "P" : "S"} 1 ${item.label.replace(/^\+\s*/, "")}`;
}
