/**
 * Shared type definitions for the owner dashboard data payload.
 * Imported by both the WS hook and the page component.
 */

export interface DashboardData {
  today: {
    /** Service + product sales after discount, paid today (before tax and tip). */
    netSales: number;
    yesterdayNetSales: number;
    salesDiff: number;
    visits: number;
    avgTicket: number;
    appointments: { completed: number; inService: number; waiting: number; upcoming: number; noShow: number };
    longestWaitMinutes: number | null;
    team: { working: number };
  };
  todayFinancials: {
    netSales: number; services: number; products: number; discounts: number; tax: number; tips: number; collected: number;
    byMethod: Record<string, number>;
  };
  schedule: {
    id: number; time: string; duration: number; customerType: "New" | "Regular" | "VIP"; customerName: string; serviceName: string;
    staffId: number | null; staffName: string | null; staffAvatarThumbUrl?: string | null; status: string; totalPaid: number;
    startedAt: string | null; checkedInAt: string | null;
  }[];
  teamPerformance: { name: string; sales: number; tickets: number; tips: number; avgTicket: number }[];
  computedAt: number;
}
