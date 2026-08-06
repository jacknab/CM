/**
 * Shared type definitions for the owner dashboard data payload.
 * Imported by both the WS hook and the page component.
 */

export interface DashboardData {
  today: {
    revenue: number;
    yesterdayRevenue: number;
    revenueDiff: number;
    byPaymentMethod: Record<string, number>;
    totalAppointments: number;
    appointments: {
      completed: number;
      inService: number;
      waiting: number;
      upcoming: number;
      noShow: number;
    };
    clients: {
      total: number;
      new: number;
      returning: number;
      returningPct: number;
    };
    team: {
      working: number;
      servicesCompleted: number;
      generated: number;
    };
  };
  schedule: Array<{
    id: number;
    time: string;
    duration: number;
    customerType: "New" | "Regular" | "VIP";
    customerName: string;
    serviceName: string;
    staffId: number | null;
    staffName: string | null;
    staffAvatarThumbUrl: string | null;
    status: string;
    totalPaid: number;
    startedAt: string | null;
    checkedInAt: string | null;
  }>;
  monthRevenue: {
    total: number;
    byPaymentMethod: Record<string, number>;
  };
  clientLoyalty: {
    returningClients: number;
    newClients: number;
    allTimeClients: number;
    retentionPct: number;
    avgVisitsPerClient: number;
  };
  needsAttention: Array<{
    type: string;
    label: string;
    count?: number;
    priority: "high" | "medium" | "low";
  }>;
  recentActivity: Array<{
    id: number;
    eventType: string;
    message: string;
    amount: number | null;
    createdAt: string;
  }>;
  topServices: Array<{
    rank: number;
    name: string;
    revenue: number;
    count: number;
  }>;
  teamPerformance: Array<{
    name: string;
    sales: number;
    appointments: number;
    avgTicket: number;
  }>;
  aiReceptionist: {
    todayCalls: number;
    booked: number;
    missed: number;
    isLive: boolean;
  };
  inventoryAlerts: Array<{
    name: string;
    category: string | null;
    stock: number;
    threshold: number;
  }>;
  todayFinancials: {
    totalRevenue: number;
    serviceSales: number;
    productSales: number;
    tips: number;
    totalPayments: number;
    byMethod: Record<string, number>;
    outstandingBalance: number;
  };
  clientLoyaltySnapshot: {
    vipClients: number;
    regulars: number;
    newThisMonth: number;
    atRisk: number;
  };
  glanceStats: {
    walkInsToday: number;
    avgWaitMinutes: number;
    occupancyPct: number;
    avgTicket: number;
    tipsPct: number;
    clientRetentionPct: number;
  };
  newClientsThisWeek: {
    count: number;
    vsLastWeek: number;
  };
  computedAt: number;
}
