import { z } from 'zod';
import { 
  insertLocationSchema,
  insertServiceCategorySchema,
  insertServiceSchema, 
  insertAddonSchema,
  insertServiceAddonSchema,
  insertAppointmentAddonSchema,
  insertStaffSchema,
  insertStaffServiceSchema,
  insertStaffAvailabilitySchema,
  insertBusinessHoursSchema,
  insertCalendarSettingsSchema,
  insertCustomerSchema, 
  insertAppointmentSchema, 
  insertProductSchema,
  insertCashDrawerSessionSchema,
  insertDrawerActionSchema,
  businessDays,
  businessDayActions,
  locations,
  serviceCategories,
  services,
  addons,
  serviceAddons,
  appointmentAddons,
  staffServices,
  staffAvailability,
  businessHours,
  calendarSettings,
  staff,
  appointments,
  products,
  cashDrawerSessions,
  drawerActions,
} from './schema';
import type { Customer } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  stores: {
    list: {
      method: 'GET' as const,
      path: '/api/stores' as const,
      responses: {
        200: z.array(z.custom<typeof locations.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/stores/:id' as const,
      responses: {
        200: z.custom<typeof locations.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/stores' as const,
      input: insertLocationSchema,
      responses: {
        201: z.custom<typeof locations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/stores/:id' as const,
      input: insertLocationSchema.partial(),
      responses: {
        200: z.custom<typeof locations.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  businessHours: {
    get: {
      method: 'GET' as const,
      path: '/api/business-hours' as const,
      responses: {
        200: z.array(z.custom<typeof businessHours.$inferSelect>()),
      },
    },
    set: {
      method: 'PUT' as const,
      path: '/api/business-hours' as const,
      input: z.object({
        storeId: z.number(),
        hours: z.array(z.object({
          dayOfWeek: z.number().min(0).max(6),
          openTime: z.string(),
          closeTime: z.string(),
          isClosed: z.boolean(),
        })),
      }),
      responses: {
        200: z.array(z.custom<typeof businessHours.$inferSelect>()),
        400: errorSchemas.validation,
      },
    },
  },
  serviceCategories: {
    list: {
      method: 'GET' as const,
      path: '/api/service-categories' as const,
      responses: {
        200: z.array(z.custom<typeof serviceCategories.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/service-categories' as const,
      input: insertServiceCategorySchema,
      responses: {
        201: z.custom<typeof serviceCategories.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/service-categories/:id' as const,
      input: insertServiceCategorySchema.partial(),
      responses: {
        200: z.custom<typeof serviceCategories.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/service-categories/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    reorder: {
      method: 'POST' as const,
      path: '/api/service-categories/reorder' as const,
      input: z.object({
        orderedIds: z.array(z.number()),
        storeId: z.number(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  },
  services: {
    list: {
      method: 'GET' as const,
      path: '/api/services' as const,
      input: z.object({ storeId: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof services.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/services/:id' as const,
      responses: {
        200: z.custom<typeof services.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/services' as const,
      input: insertServiceSchema,
      responses: {
        201: z.custom<typeof services.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/services/:id' as const,
      input: insertServiceSchema.partial(),
      responses: {
        200: z.custom<typeof services.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/services/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  addons: {
    list: {
      method: 'GET' as const,
      path: '/api/addons' as const,
      responses: {
        200: z.array(z.custom<typeof addons.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/addons' as const,
      input: insertAddonSchema,
      responses: {
        201: z.custom<typeof addons.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/addons/:id' as const,
      input: insertAddonSchema.partial(),
      responses: {
        200: z.custom<typeof addons.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/addons/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  serviceAddons: {
    list: {
      method: 'GET' as const,
      path: '/api/service-addons' as const,
      responses: {
        200: z.array(z.custom<typeof serviceAddons.$inferSelect & { addon: typeof addons.$inferSelect }>()),
      },
    },
    forService: {
      method: 'GET' as const,
      path: '/api/services/:id/addons' as const,
      responses: {
        200: z.array(z.custom<typeof addons.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/service-addons' as const,
      input: insertServiceAddonSchema,
      responses: {
        201: z.custom<typeof serviceAddons.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/service-addons/:id' as const,
      responses: {
        204: z.void(),
      },
    },
  },
  appointmentAddons: {
    forAppointment: {
      method: 'GET' as const,
      path: '/api/appointments/:id/addons' as const,
      responses: {
        200: z.array(z.custom<typeof addons.$inferSelect>()),
      },
    },
    set: {
      method: 'POST' as const,
      path: '/api/appointments/:id/addons' as const,
      input: z.object({ addonIds: z.array(z.number()) }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        409: z.object({ message: z.string(), availableMinutes: z.number().optional() }),
      },
    },
  },
  staffServices: {
    list: {
      method: 'GET' as const,
      path: '/api/staff-services' as const,
      responses: {
        200: z.array(z.custom<typeof staffServices.$inferSelect>()),
      },
    },
    forService: {
      method: 'GET' as const,
      path: '/api/services/:id/staff' as const,
      responses: {
        200: z.array(z.custom<typeof staff.$inferSelect>()),
      },
    },
    set: {
      method: 'POST' as const,
      path: '/api/staff/:id/services' as const,
      input: z.object({ serviceIds: z.array(z.number()) }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  staffAvailability: {
    get: {
      method: 'GET' as const,
      path: '/api/staff/:id/availability' as const,
      responses: {
        200: z.array(z.custom<typeof staffAvailability.$inferSelect>()),
      },
    },
    set: {
      method: 'POST' as const,
      path: '/api/staff/:id/availability' as const,
      input: z.object({ rules: z.array(insertStaffAvailabilitySchema.omit({ staffId: true })) }),
      responses: {
        200: z.array(z.custom<typeof staffAvailability.$inferSelect>()),
      },
    },
    deleteRule: {
      method: 'DELETE' as const,
      path: '/api/staff-availability/:id' as const,
      responses: {
        204: z.void(),
      },
    },
  },
  availability: {
    slots: {
      method: 'GET' as const,
      path: '/api/availability/slots' as const,
      responses: {
        200: z.array(z.object({
          time: z.string(),
          staffId: z.number(),
          staffName: z.string(),
        })),
      },
    },
  },
  staff: {
    list: {
      method: 'GET' as const,
      path: '/api/staff' as const,
      input: z.object({ storeId: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof staff.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/staff/:id' as const,
      responses: {
        200: z.custom<typeof staff.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/staff' as const,
      input: insertStaffSchema,
      responses: {
        201: z.custom<typeof staff.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/staff/:id' as const,
      input: insertStaffSchema.partial(),
      responses: {
        200: z.custom<typeof staff.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/staff/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers' as const,
      input: z.object({ storeId: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<Customer>()),
      },
    },
    searchByPhone: {
      method: 'GET' as const,
      path: '/api/customers/search' as const,
      input: z.object({ phone: z.string(), storeId: z.coerce.number() }),
      responses: {
        200: z.custom<Customer>().nullable(),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers' as const,
      input: insertCustomerSchema,
      responses: {
        201: z.custom<Customer>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/customers/:id' as const,
      input: insertCustomerSchema.partial(),
      responses: {
        200: z.custom<Customer>(),
        404: errorSchemas.notFound,
      },
    },
  },
  appointments: {
    list: {
      method: 'GET' as const,
      path: '/api/appointments' as const,
      input: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        staffId: z.coerce.number().optional(),
        storeId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof appointments.$inferSelect & {
          service: typeof services.$inferSelect | null;
          staff: typeof staff.$inferSelect | null;
          customer: Customer | null;
          store: typeof locations.$inferSelect | null;
        }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/appointments' as const,
      input: insertAppointmentSchema,
      responses: {
        201: z.custom<typeof appointments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/appointments/:id' as const,
      input: insertAppointmentSchema.partial(),
      responses: {
        200: z.custom<typeof appointments.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/appointments/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/products' as const,
      input: z.object({ storeId: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/products' as const,
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/products/:id' as const,
      input: insertProductSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/products/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  calendarSettings: {
    get: {
      method: 'GET' as const,
      path: '/api/calendar-settings' as const,
      responses: {
        200: z.custom<typeof calendarSettings.$inferSelect>().nullable(),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/calendar-settings' as const,
      input: z.object({
        storeId: z.number(),
        startOfWeek: z.string().optional(),
        timeSlotInterval: z.number().optional(),
        nonWorkingHoursDisplay: z.number().optional(),
        allowBookingOutsideHours: z.boolean().optional(),
        autoCompleteAppointments: z.boolean().optional(),
        autoMarkNoShows: z.boolean().optional(),
        showPrices: z.boolean().optional(),
      }),
      responses: {
        200: z.custom<typeof calendarSettings.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  cashDrawer: {
    sessions: {
      method: 'GET' as const,
      path: '/api/cash-drawer/sessions' as const,
      responses: {
        200: z.array(z.custom<typeof cashDrawerSessions.$inferSelect>()),
      },
    },
    open: {
      method: 'GET' as const,
      path: '/api/cash-drawer/open' as const,
      responses: {
        200: z.custom<typeof cashDrawerSessions.$inferSelect>().nullable(),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/cash-drawer/sessions/:id' as const,
      responses: {
        200: z.custom<typeof cashDrawerSessions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/cash-drawer/sessions' as const,
      input: z.object({
        storeId: z.number(),
        openingBalance: z.string().optional().default("0.00"),
        openingDenominationBreakdown: z.string().nullable().optional(),
        openedBy: z.string().nullable().optional(),
        isInitialSetup: z.boolean().optional().default(false),
      }),
      responses: {
        201: z.custom<typeof cashDrawerSessions.$inferSelect>(),
        400: errorSchemas.validation,
        409: z.object({ message: z.string() }),
      },
    },
    close: {
      method: 'POST' as const,
      path: '/api/cash-drawer/sessions/:id/close' as const,
      input: z.object({
        closingBalance: z.string().optional().default("0.00"),
        denominationBreakdown: z.string().nullable().optional(),
        reportedCardSales: z.string().nullable().optional(),
        closedBy: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        autoOpenNext: z.boolean().optional().default(false),
      }),
      responses: {
        200: z.custom<typeof cashDrawerSessions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    action: {
      method: 'POST' as const,
      path: '/api/cash-drawer/sessions/:id/action' as const,
      input: z.object({
        type: z.enum(["open_drawer", "close_drawer", "cash_in", "cash_out"]),
        amount: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
        performedBy: z.string().nullable().optional(),
      }),
      responses: {
        201: z.custom<typeof drawerActions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    discrepancies: {
      method: 'GET' as const,
      path: '/api/cash-drawer/discrepancies' as const,
      responses: {
        200: z.array(z.custom<typeof cashDrawerSessions.$inferSelect>()),
      },
    },
    acknowledgeMismatch: {
      method: 'POST' as const,
      path: '/api/cash-drawer/sessions/:id/acknowledge-mismatch' as const,
      input: z.object({
        resolvedBy: z.string(),
        resolutionNotes: z.string().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof cashDrawerSessions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    zReport: {
      method: 'GET' as const,
      path: '/api/cash-drawer/sessions/:id/z-report' as const,
      responses: {
        200: z.object({
          session: z.custom<typeof cashDrawerSessions.$inferSelect>(),
          totalSales: z.number(),
          totalTips: z.number(),
          totalDiscounts: z.number(),
          transactionCount: z.number(),
          paymentBreakdown: z.record(z.string(), z.number()),
          cashIn: z.number(),
          cashOut: z.number(),
          expectedCash: z.number(),
        }),
        404: errorSchemas.notFound,
      },
    },
  },
  businessDay: {
    today: {
      method: 'GET' as const,
      path: '/api/cash-drawer/today' as const,
      responses: {
        200: z.object({
          today: z.custom<typeof businessDays.$inferSelect>(),
          previousUnreconciled: z.custom<typeof businessDays.$inferSelect>().nullable(),
          timezone: z.string(),
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/cash-drawer/business-day/:id' as const,
      responses: {
        200: z.custom<typeof businessDays.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    open: {
      method: 'POST' as const,
      path: '/api/cash-drawer/business-day/:id/open' as const,
      input: z.object({
        openingFloat: z.string().nullable().optional(),
        openedBy: z.string().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof businessDays.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: z.object({ message: z.string() }),
      },
    },
    reconcile: {
      method: 'POST' as const,
      path: '/api/cash-drawer/business-day/:id/reconcile' as const,
      input: z.object({
        countedCash: z.string(),
        denominationBreakdown: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        reconciledBy: z.string().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof businessDays.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    cashAction: {
      method: 'POST' as const,
      path: '/api/cash-drawer/business-day/:id/action' as const,
      input: z.object({
        type: z.enum(["cash_in", "cash_out"]),
        amount: z.string(),
        reason: z.string().nullable().optional(),
        performedBy: z.string().nullable().optional(),
      }),
      responses: {
        201: z.custom<typeof businessDayActions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
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
