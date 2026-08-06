import React, { useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TrialCountdownBannerProps {
  daysRemaining: number | null;
  subscriptionStatus: string;
}

function getTier(subscriptionStatus: string, daysRemaining: number | null) {
  if (subscriptionStatus === "expired") return "expired";
  if (subscriptionStatus === "inactive") return "inactive";
  if (subscriptionStatus !== "trial" || daysRemaining === null) return null;
  if (daysRemaining > 7) return "info";
  if (daysRemaining > 2) return "warning";
  return "urgent";
}

type Tier = "info" | "warning" | "urgent" | "expired" | "inactive";

const RING_COLORS: Record<Tier, string> = {
  info:     "#14b8a6",
  warning:  "#f59e0b",
  urgent:   "#ef4444",
  expired:  "#ef4444",
  inactive: "#64748b",
};

const UPGRADE_COLORS: Record<Tier, { bg: string; hover: string }> = {
  info:     { bg: "#f59e0b", hover: "#d97706" },
  warning:  { bg: "#f59e0b", hover: "#d97706" },
  urgent:   { bg: "#ef4444", hover: "#dc2626" },
  expired:  { bg: "#ef4444", hover: "#dc2626" },
  inactive: { bg: "#6366f1", hover: "#4f46e5" },
};

function getCtaLabel(tier: Tier) {
  if (tier === "expired" || tier === "inactive") return "Reactivate";
  return "Upgrade";
}

function getBannerText(tier: Tier, daysRemaining: number | null) {
  if (tier === "expired")  return "Your free trial has ended";
  if (tier === "inactive") return "Your subscription is inactive";
  if (daysRemaining === 0) return "Trial expires today";
  return "Days left on free trial period";
}

/** SVG circular progress ring — shows days as an arc */
function DayRing({ days, tier }: { days: number | null; tier: Tier }) {
  const color = RING_COLORS[tier];
  const size = 36;
  const strokeW = 2.5;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;

  const maxDays = 60;
  const fraction = days === null ? 1 : Math.max(0, Math.min(1, days / maxDays));
  const dash = fraction * circ;

  const label =
    tier === "expired"  ? "!" :
    tier === "inactive" ? "–" :
    days === null ? "?" :
    String(days);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={strokeW}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
      {/* Day count */}
      <text
        x="50%" y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={days !== null && days > 9 ? "11" : "12"}
        fontWeight="700"
        fontFamily="Inter, sans-serif"
        fill={color}
      >
        {label}
      </text>
    </svg>
  );
}

export const TrialCountdownBanner: React.FC<TrialCountdownBannerProps> = ({
  daysRemaining,
  subscriptionStatus,
}) => {
  const navigate = useNavigate();
  const tier = getTier(subscriptionStatus, daysRemaining) as Tier | null;

  const dismissKey = tier ? `trial-banner-v2-dismissed-${tier}` : null;
  const [dismissed, setDismissed] = useState(
    () => dismissKey ? sessionStorage.getItem(dismissKey) === "1" : false
  );
  const [upgradeHovered, setUpgradeHovered] = useState(false);

  if (!tier || dismissed) return null;

  const upgradeColors = UPGRADE_COLORS[tier];
  const showDays = tier !== "expired" && tier !== "inactive";

  const handleDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const handleCta = () => navigate("/manage/billing");

  return (
    <div
      role="alert"
      style={{
        width: "100%",
        background: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 20px",
        gap: 16,
        flexShrink: 0,
        minHeight: 52,
      }}
    >
      {/* Left — ring + text */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <DayRing days={showDays ? daysRemaining : null} tier={tier} />
        <span style={{
          fontSize: "0.875rem",
          color: "#334155",
          fontWeight: 500,
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {getBannerText(tier, daysRemaining)}
        </span>
      </div>

      {/* Right — upgrade button + dismiss */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button
          onClick={handleCta}
          onMouseEnter={() => setUpgradeHovered(true)}
          onMouseLeave={() => setUpgradeHovered(false)}
          style={{
            background: upgradeHovered ? upgradeColors.hover : upgradeColors.bg,
            color: "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "6px 20px",
            fontSize: "0.85rem",
            fontWeight: 600,
            fontFamily: "Inter, sans-serif",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.15s",
            letterSpacing: "-0.01em",
          }}
        >
          {getCtaLabel(tier)}
        </button>

        {tier !== "expired" && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
