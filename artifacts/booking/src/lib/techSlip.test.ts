import { describe, expect, it } from "vitest";
import { SLIP_WIDTH, buildTechSlipText, type TechSlip } from "./techSlip";

const slip: TechSlip = {
  storeName: "Lush Nail Bar", staffName: "Amy Tran", period: "pay", firstDay: "2026-05-01", lastDay: "2026-05-03", payDate: "2026-05-08",
  payrollType: "Commission", commissionOn: true,
  totals: { sale: 4564.6, commission: 2738.76, ncTips: 495.33, cashTips: 0, pay: 3234.09, tickets: 31 },
  days: [
    { date: "2026-05-01", sale: 302, commission: 181.2, ncTips: 32.8 },
    { date: "2026-05-02", sale: 331, commission: 198.6, ncTips: 36.84 },
    { date: "2026-05-03", sale: 0, commission: 0, ncTips: 0 },
  ],
  tickets: [],
};
const body = (text: string) => text.split("\n").map((l) => l.replace(/^\[[LC]\]/, "").replace(/<\/?b>/g, ""));

describe("technician pay slip", () => {
  it("lays out Employee Pay and one line per day, like the salons' own slips", () => {
    const lines = body(buildTechSlipText(slip));
    expect(lines).toContain("Total Sales             $4564.60");
    expect(lines).toContain("Tickets                       31");
    expect(lines).toContain("Total Commission        $2738.76");
    expect(lines).toContain("+Non-Cash Tips           $495.33");
    expect(lines).toContain("Total Pay               $3234.09");
    expect(lines).toContain("01-FRI  $302.00  $181.20  $32.80");
    expect(lines).toContain("03-SUN    $0.00    $0.00   $0.00");
    expect(lines).toContain("Pay Period   05/01/26 - 05/03/26");
    expect(lines).toContain("Pay Date              05/08/2026");
    // The ticket count sits under Total Sales, not at the bottom.
    expect(lines.indexOf("Tickets                       31")).toBe(lines.indexOf("Total Sales             $4564.60") + 1);
  });
  it("never runs past the paper width", () => {
    for (const line of body(buildTechSlipText(slip)).filter((l) => !l.startsWith("LUSH"))) expect(line.length).toBeLessThanOrEqual(SLIP_WIDTH);
  });
  it("lists the tickets for a one-day slip, and the cash tips kept", () => {
    const text = buildTechSlipText({ ...slip, period: "today", firstDay: "2026-05-01", lastDay: "2026-05-01",
      totals: { ...slip.totals, cashTips: 20, tickets: 1 },
      tickets: [{ ticketNumber: 142, closedAt: "2026-05-01T19:15:00Z", service: "Gel Manicure", sale: 40, commission: 24, tip: 8, nonCashTip: 8 }] }, "UTC");
    const lines = body(text);
    expect(lines).toContain("#142 7:15pm Gel Manicure");
    expect(lines).toContain("         $40.00   $24.00   $8.00");
    expect(lines).toContain("Cash tips (kept)          $20.00");
  });
});
