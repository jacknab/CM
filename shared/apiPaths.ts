/**
 * Every API route's method and path, without the request/response checks in shared/routes.ts.
 * The browser imports this file: shared/routes.ts builds its checks from the database schema, and
 * importing it would put the schema and Drizzle in the browser bundle. The server keeps using
 * shared/routes.ts; a test (api-server src/lib/apiPaths.test.ts) keeps the two the same.
 */
export const api = {
  stores: {
    list: { method: "GET" as const, path: "/api/stores" as const },
    get: { method: "GET" as const, path: "/api/stores/:id" as const },
    create: { method: "POST" as const, path: "/api/stores" as const },
    update: { method: "PATCH" as const, path: "/api/stores/:id" as const },
  },
  businessHours: {
    get: { method: "GET" as const, path: "/api/business-hours" as const },
    set: { method: "PUT" as const, path: "/api/business-hours" as const },
  },
  serviceCategories: {
    list: { method: "GET" as const, path: "/api/service-categories" as const },
    create: { method: "POST" as const, path: "/api/service-categories" as const },
    update: { method: "PATCH" as const, path: "/api/service-categories/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/service-categories/:id" as const },
    reorder: { method: "POST" as const, path: "/api/service-categories/reorder" as const },
  },
  services: {
    list: { method: "GET" as const, path: "/api/services" as const },
    get: { method: "GET" as const, path: "/api/services/:id" as const },
    create: { method: "POST" as const, path: "/api/services" as const },
    update: { method: "PATCH" as const, path: "/api/services/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/services/:id" as const },
    deleteAll: { method: "DELETE" as const, path: "/api/services" as const },
  },
  addons: {
    list: { method: "GET" as const, path: "/api/addons" as const },
    create: { method: "POST" as const, path: "/api/addons" as const },
    update: { method: "PATCH" as const, path: "/api/addons/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/addons/:id" as const },
  },
  packages: {
    list: { method: "GET" as const, path: "/api/packages" as const },
    get: { method: "GET" as const, path: "/api/packages/:id" as const },
    create: { method: "POST" as const, path: "/api/packages" as const },
    update: { method: "PATCH" as const, path: "/api/packages/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/packages/:id" as const },
    reorder: { method: "POST" as const, path: "/api/packages/reorder" as const },
  },
  deals: {
    list: { method: "GET" as const, path: "/api/deals" as const },
    get: { method: "GET" as const, path: "/api/deals/:id" as const },
    create: { method: "POST" as const, path: "/api/deals" as const },
    update: { method: "PATCH" as const, path: "/api/deals/:id" as const },
  },
  serviceAddons: {
    list: { method: "GET" as const, path: "/api/service-addons" as const },
    forService: { method: "GET" as const, path: "/api/services/:id/addons" as const },
    create: { method: "POST" as const, path: "/api/service-addons" as const },
    delete: { method: "DELETE" as const, path: "/api/service-addons/:id" as const },
  },
  appointmentAddons: {
    forAppointment: { method: "GET" as const, path: "/api/appointments/:id/addons" as const },
    set: { method: "POST" as const, path: "/api/appointments/:id/addons" as const },
  },
  staffServices: {
    list: { method: "GET" as const, path: "/api/staff-services" as const },
    forService: { method: "GET" as const, path: "/api/services/:id/staff" as const },
    set: { method: "POST" as const, path: "/api/staff/:id/services" as const },
  },
  staffAvailability: {
    get: { method: "GET" as const, path: "/api/staff/:id/availability" as const },
    set: { method: "POST" as const, path: "/api/staff/:id/availability" as const },
    deleteRule: { method: "DELETE" as const, path: "/api/staff-availability/:id" as const },
  },
  availability: {
    slots: { method: "GET" as const, path: "/api/availability/slots" as const },
  },
  staff: {
    list: { method: "GET" as const, path: "/api/staff" as const },
    get: { method: "GET" as const, path: "/api/staff/:id" as const },
    create: { method: "POST" as const, path: "/api/staff" as const },
    update: { method: "PATCH" as const, path: "/api/staff/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/staff/:id" as const },
  },
  customers: {
    list: { method: "GET" as const, path: "/api/customers" as const },
    searchByPhone: { method: "GET" as const, path: "/api/customers/search" as const },
    create: { method: "POST" as const, path: "/api/customers" as const },
    update: { method: "PATCH" as const, path: "/api/customers/:id" as const },
  },
  appointments: {
    list: { method: "GET" as const, path: "/api/appointments" as const },
    create: { method: "POST" as const, path: "/api/appointments" as const },
    update: { method: "PATCH" as const, path: "/api/appointments/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/appointments/:id" as const },
  },
  products: {
    list: { method: "GET" as const, path: "/api/products" as const },
    create: { method: "POST" as const, path: "/api/products" as const },
    update: { method: "PATCH" as const, path: "/api/products/:id" as const },
    delete: { method: "DELETE" as const, path: "/api/products/:id" as const },
  },
  calendarSettings: {
    get: { method: "GET" as const, path: "/api/calendar-settings" as const },
    upsert: { method: "PUT" as const, path: "/api/calendar-settings" as const },
  },
  cashDrawer: {
    sessions: { method: "GET" as const, path: "/api/cash-drawer/sessions" as const },
    open: { method: "GET" as const, path: "/api/cash-drawer/open" as const },
    get: { method: "GET" as const, path: "/api/cash-drawer/sessions/:id" as const },
    create: { method: "POST" as const, path: "/api/cash-drawer/sessions" as const },
    close: { method: "POST" as const, path: "/api/cash-drawer/sessions/:id/close" as const },
    action: { method: "POST" as const, path: "/api/cash-drawer/sessions/:id/action" as const },
    discrepancies: { method: "GET" as const, path: "/api/cash-drawer/discrepancies" as const },
    acknowledgeMismatch: { method: "POST" as const, path: "/api/cash-drawer/sessions/:id/acknowledge-mismatch" as const },
    zReport: { method: "GET" as const, path: "/api/cash-drawer/sessions/:id/z-report" as const },
    zReportFull: { method: "GET" as const, path: "/api/cash-drawer/sessions/:id/z-report-full" as const },
  },
  businessDay: {
    today: { method: "GET" as const, path: "/api/cash-drawer/today" as const },
    get: { method: "GET" as const, path: "/api/cash-drawer/business-day/:id" as const },
    open: { method: "POST" as const, path: "/api/cash-drawer/business-day/:id/open" as const },
    reconcile: { method: "POST" as const, path: "/api/cash-drawer/business-day/:id/reconcile" as const },
    cashAction: { method: "POST" as const, path: "/api/cash-drawer/business-day/:id/action" as const },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
