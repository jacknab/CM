import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft,
  BarChart3,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  format, addDays, subDays, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type IncomeData = {
  name: string;
  from: string;
  to:   string;
  serviceIncome:  string;
  commission:     string;
  cardCharge:     string;
  cashDiscount:   string;
  discountCharge: string;
  cardTips:       string;
  cardTipCharge:  string;
  totalTip:       string;
  cashIncome:     string;
  checkIncome:    string;
  total:          string;
};

type CommissionData = {
  name:                string;
  serviceStaff:        number;
  serviceSalon:        number;
  productStaff:        number;
  productSalon:        number;
  giftCardStaff:       number;
  giftCardSalon:       number;
  cashCheckStaff:      number;
  cashCheckSalon:      number;
  cardTipChargePercent: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: string | undefined) {
  const n = parseFloat(val ?? "0");
  const abs = Math.abs(n);
  if (n < 0) return `-$${abs.toFixed(2)}`;
  return `$${abs.toFixed(2)}`;
}

function neg(val: string | undefined) {
  const n = parseFloat(val ?? "0");
  if (n === 0) return "-$0.00";
  return `-$${n.toFixed(2)}`;
}

function dateLabel(s: string) {
  try { return format(parseISO(s), "MM/dd/yyyy"); } catch { return s; }
}

// ─── Row components ───────────────────────────────────────────────────────────

function DashedRow({
  label,
  value,
  bold = false,
  valueClass = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between py-2 border-b border-dashed border-slate-200",
        bold && "font-bold",
      )}
    >
      <span className={cn("text-[14px] text-slate-700", bold && "font-bold")}>{label}</span>
      <span className={cn("text-[14px] text-slate-800 ml-4 shrink-0", bold && "font-bold", valueClass)}>
        {value}
      </span>
    </div>
  );
}

function SolidDivider() {
  return <div className="border-t border-slate-300 my-1" />;
}

// ─── Commission Structure Modal ───────────────────────────────────────────────

function CommissionModal({
  data,
  onClose,
}: {
  data: CommissionData;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Purple header */}
        <div className="bg-[#4338ca] px-6 py-5 flex items-center justify-between">
          <h2 className="text-white font-extrabold text-xl text-center flex-1">
            Commission Structure
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-center text-[18px] font-bold text-emerald-500 mb-5">
            Commission
          </p>

          <div className="space-y-1 mb-4">
            <p className="text-[14px] text-slate-800">
              <span className="font-bold">Employee:</span>{" "}
              {data.name}
            </p>
            <p className="text-[14px] font-bold text-slate-800">Commission:</p>
          </div>

          {/* Commission rows */}
          <div className="divide-y divide-slate-200">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4338ca] shrink-0" />
                <span className="text-[14px] text-slate-700">Service:</span>
                <span className="flex-1 border-b border-dotted border-slate-300 mx-2 min-w-[60px]" />
              </div>
              <span className="text-[14px] font-bold text-slate-900 ml-4">
                {data.serviceStaff}-{data.serviceSalon}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4338ca] shrink-0" />
                <span className="text-[14px] text-slate-700">Product:</span>
                <span className="flex-1 border-b border-dotted border-slate-300 mx-2 min-w-[60px]" />
              </div>
              <span className="text-[14px] font-bold text-slate-900 ml-4">
                {data.productStaff}-{data.productSalon}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4338ca] shrink-0" />
                <span className="text-[14px] text-slate-700">GiftCard:</span>
                <span className="flex-1 border-b border-dotted border-slate-300 mx-2 min-w-[60px]" />
              </div>
              <span className="text-[14px] font-bold text-slate-900 ml-4">
                {data.giftCardStaff}-{data.giftCardSalon}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-[14px] text-slate-700">Cash - Check Percentage:</span>
              <span className="flex-1 border-b border-dotted border-slate-300 mx-2 min-w-[30px]" />
              <span className="text-[14px] font-bold text-slate-900">
                {data.cashCheckStaff}-{data.cashCheckSalon}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-slate-700 leading-snug">
                Percentage Charge For<br />Credit Card Tips:
              </span>
              <span className="flex-1 border-b border-dotted border-slate-300 mx-2 min-w-[20px]" />
              <span className="text-[14px] font-bold text-slate-900">
                {data.cardTipChargePercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Close button */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl border-2 border-[#4338ca] text-[#4338ca] font-bold text-[16px] active:bg-indigo-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StaffIncome() {
  const navigate  = useNavigate();
  const printRef  = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showCommission, setShowCommission] = useState(false);

  // Compute from/to based on mode
  const parsedDate = parseISO(selectedDate);
  const fromDate = mode === "week"  ? format(startOfWeek(parsedDate, { weekStartsOn: 0 }), "yyyy-MM-dd")
                 : mode === "month" ? format(startOfMonth(parsedDate), "yyyy-MM-dd")
                 : selectedDate;
  const toDate   = mode === "week"  ? format(endOfWeek(parsedDate, { weekStartsOn: 0 }), "yyyy-MM-dd")
                 : mode === "month" ? format(endOfMonth(parsedDate), "yyyy-MM-dd")
                 : selectedDate;
  const rangeLabel = mode === "month" ? format(parsedDate, "MMMM yyyy")
                   : mode === "week"  ? `${dateLabel(fromDate)} – ${dateLabel(toDate)}`
                   : dateLabel(selectedDate);

  // Income data
  const { data: income, isLoading } = useQuery<IncomeData>({
    queryKey: ["/api/staff/me/income", fromDate, toDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/staff/me/income?from=${fromDate}&to=${toDate}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load income");
      return res.json();
    },
  });

  // Commission structure
  const { data: commission } = useQuery<CommissionData>({
    queryKey: ["/api/staff/me/commission-structure"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/commission-structure", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load commission");
      return res.json();
    },
  });

  const staffName = income?.name ?? commission?.name ?? "";

  const handlePrev = () => {
    const d = parseISO(selectedDate);
    if (mode === "month") setSelectedDate(format(subMonths(d, 1), "yyyy-MM-dd"));
    else if (mode === "week") setSelectedDate(format(subDays(d, 7), "yyyy-MM-dd"));
    else setSelectedDate(format(subDays(d, 1), "yyyy-MM-dd"));
  };
  const handleNext = () => {
    const d = parseISO(selectedDate);
    if (mode === "month") setSelectedDate(format(addMonths(d, 1), "yyyy-MM-dd"));
    else if (mode === "week") setSelectedDate(format(addDays(d, 7), "yyyy-MM-dd"));
    else setSelectedDate(format(addDays(d, 1), "yyyy-MM-dd"));
  };

  const handleDownload = () => {
    if (!printRef.current || !income) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Staff Income – ${income.name} – ${dateLabel(selectedDate)}</title>
      <style>
        body { font-family: sans-serif; padding: 24px; max-width: 480px; margin: 0 auto; }
        h2 { font-weight: 900; font-size: 18px; margin: 0 0 4px; }
        p  { margin: 2px 0; font-size: 14px; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; font-size: 14px; }
        .bold { font-weight: 700; }
        .green { color: #16a34a; font-weight: 700; }
        .divider { border-top: 1px solid #aaa; margin: 6px 0; }
        .footer { text-align: center; font-weight: 700; font-size: 16px; margin-top: 24px; }
      </style></head><body>
      <h2>STAFF INCOME</h2>
      <p><strong>Date:</strong> ${dateLabel(selectedDate)}</p>
      <p><strong>Name:</strong> ${income.name}</p>
      <div class="divider"></div>
      <div class="row"><span>Income</span><span>${fmt(income.serviceIncome)}</span></div>
      <div class="row"><span>Commission</span><span>${fmt(income.commission)}</span></div>
      <div class="row"><span>Card Charge</span><span>${neg(income.cardCharge)}</span></div>
      <div class="row"><span>Cash Discount Charge</span><span>${neg(income.cashDiscount)}</span></div>
      <div class="row"><span>Discount Charge</span><span>${neg(income.discountCharge)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Tip by card (1)</span><span>${fmt(income.cardTips)}</span></div>
      <div class="row"><span>Tip charge by card (2)</span><span>${neg(income.cardTipCharge)}</span></div>
      <div class="row bold"><span>Total tip (1+2)</span><span>${fmt(income.totalTip)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Cash Income:</span><span>${fmt(income.cashIncome)}</span></div>
      <div class="row"><span>Check Income:</span><span>${fmt(income.checkIncome)}</span></div>
      <div class="row green"><span>Total:</span><span>${fmt(income.total)}</span></div>
      <div class="footer">Thanks ${income.name}</div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="flex flex-col bg-white" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100 transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <h1 className="flex-1 font-bold text-[17px] text-slate-900 text-center">Income</h1>
        <div className="w-9" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 pt-5 pb-4" ref={printRef}>

          {/* Commission Structure button */}
          <button
            onClick={() => setShowCommission(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-[#4338ca] text-[#4338ca] font-bold text-[14px] active:bg-indigo-50 transition-colors mb-5"
          >
            <BarChart3 className="w-4 h-4" />
            Commission Structure
          </button>

          {/* Mode chips */}
          <div className="flex items-center justify-center gap-2 mb-3">
            {(["day", "week", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wide transition-colors",
                  mode === m
                    ? "bg-[#4338ca] text-white"
                    : "bg-slate-100 text-slate-500 active:bg-slate-200",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Date navigator */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <button onClick={handlePrev} className="p-1.5 rounded-full active:bg-slate-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            {mode === "day" ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
                className="text-[14px] font-semibold text-slate-700 bg-transparent outline-none border-b border-slate-300 pb-0.5 text-center"
              />
            ) : (
              <span className="text-[14px] font-semibold text-slate-700 border-b border-slate-300 pb-0.5 text-center">
                {rangeLabel}
              </span>
            )}
            <button onClick={handleNext} className="p-1.5 rounded-full active:bg-slate-100 transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Report header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-extrabold text-[16px] text-slate-900 uppercase tracking-wide">
                Staff Income
              </p>
              <p className="text-[13px] text-slate-700 mt-0.5">
                <span className="font-bold">{mode === "day" ? "Date:" : "Period:"}</span>{" "}
                {rangeLabel}
              </p>
              <p className="text-[13px] text-slate-700">
                <span className="font-bold">Name:</span>{" "}
                {staffName || "—"}
              </p>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md active:bg-emerald-600 transition-colors shrink-0"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          <SolidDivider />

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-[14px]">Loading…</div>
          ) : income ? (
            <>
              {/* Income section */}
              <DashedRow label="Income"               value={fmt(income.serviceIncome)} />
              <DashedRow label="Commission"            value={fmt(income.commission)} />
              <DashedRow label="Card Charge"           value={neg(income.cardCharge)} />
              <DashedRow label="Cash Discount Charge"  value={neg(income.cashDiscount)} />
              <DashedRow label="Discount Charge"       value={neg(income.discountCharge)} />

              <SolidDivider />

              {/* Tips section */}
              <DashedRow label="Tip by card (1)"       value={fmt(income.cardTips)} />
              <DashedRow label="Tip charge by card (2)" value={neg(income.cardTipCharge)} />
              <DashedRow
                label="Total tip (1+2)"
                value={fmt(income.totalTip)}
                bold
              />

              <SolidDivider />

              {/* Cash / Check section */}
              <DashedRow label="Cash Income:"          value={fmt(income.cashIncome)} />
              <DashedRow label="Check Income:"         value={fmt(income.checkIncome)} />
              <div className="flex items-baseline justify-between py-2">
                <span className="text-[15px] font-bold text-emerald-600">Total:</span>
                <span className="text-[15px] font-bold text-emerald-600">
                  {fmt(income.total)}
                </span>
              </div>

              {/* Thanks footer */}
              <div className="mt-8 mb-2 text-center">
                <p className="font-bold text-[16px] text-slate-800">
                  Thanks {income.name}
                </p>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400 text-[14px]">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Commission modal */}
      {showCommission && commission && (
        <CommissionModal data={commission} onClose={() => setShowCommission(false)} />
      )}

      <StaffPortalNav />
    </div>
  );
}
