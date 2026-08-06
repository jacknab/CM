import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface StaffBackHeaderProps {
  title: string;
  subtitle?: string;
}

export function StaffBackHeader({ title, subtitle }: StaffBackHeaderProps) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / .06)",
        marginLeft: -32,
        marginRight: -32,
      }}
    >
      <button
        onClick={() => navigate("/payouts/contractors")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fff",
          cursor: "pointer",
          fontSize: ".82rem",
          fontWeight: 600,
          color: "#374151",
          transition: "background .12s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#f9fafb")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#fff")}
      >
        <ChevronLeft style={{ width: 14, height: 14 }} />
        Staff &amp; Earnings
      </button>
      <div style={{ width: 1, height: 18, background: "#e5e7eb", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: ".92rem", fontWeight: 700, color: "#1c1917" }}>{title}</span>
        {subtitle && (
          <span style={{ marginLeft: 8, fontSize: ".8rem", color: "#9ca3af" }}>{subtitle}</span>
        )}
      </div>
    </div>
  );
}
