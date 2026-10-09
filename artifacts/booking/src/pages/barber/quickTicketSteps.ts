/** The nail wrapper's six-step quick ticket, with barbershop line-item labels. */
export const QUICK_TICKET_STEPS = [
  { prompt: "Haircut Amount", label: "Haircut" },
  { prompt: "Beard Trim Amount", label: "Beard Trim" },
  { prompt: "Shave Amount", label: "Shave" },
  { prompt: "Wash Amount", label: "Wash" },
  { prompt: "Styling Amount", label: "Styling" },
  { prompt: "Extra Amount", label: "Extra" },
] as const;
