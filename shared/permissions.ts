// =============================================================================
// PERMISSION CATALOG
// -----------------------------------------------------------------------------
// Single source of truth for every gated capability in the app.
// Used by both the server (route guards, data scoping) and the client
// (hiding nav items, disabling actions).
// =============================================================================

export const PERMISSIONS = {
  // Appointments / calendar
  APPOINTMENTS_VIEW_ALL: "appointments.viewAll",
  APPOINTMENTS_VIEW_OWN: "appointments.viewOwn",
  APPOINTMENTS_EDIT: "appointments.edit",
  APPOINTMENTS_DELETE: "appointments.delete",
  APPOINTMENTS_CANCEL: "appointments.cancel",
  APPOINTMENTS_RESCHEDULE: "appointments.reschedule",
  APPOINTMENTS_MARK_COMPLETE: "appointments.markComplete",
  APPOINTMENTS_OVERRIDE_RULES: "appointments.overrideRules",
  WAITLIST_ACCESS: "waitlist.access",

  // Customers
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_VIEW_CONTACT: "customers.viewContact",
  CUSTOMERS_EDIT: "customers.edit",
  CUSTOMERS_DELETE: "customers.delete",
  CUSTOMERS_EXPORT: "customers.export",
  CUSTOMERS_IMPORT: "customers.import",

  // Catalog
  SERVICES_MANAGE: "services.manage",
  PRODUCTS_MANAGE: "products.manage",
  PRICING_VIEW: "pricing.view",
  PRICING_EDIT: "pricing.edit",
  INVENTORY_MANAGE: "inventory.manage",

  // Team
  STAFF_MANAGE: "staff.manage",
  STAFF_PERMISSIONS_MANAGE: "staff.permissionsManage",
  STAFF_INVITE: "staff.invite",
  STAFF_REMOVE: "staff.remove",

  // Reports & money
  REPORTS_VIEW: "reports.view",
  REPORTS_FINANCIAL: "reports.financial",
  REPORTS_EXPORT: "reports.export",
  COMMISSIONS_VIEW_ALL: "commissions.viewAll",
  COMMISSIONS_VIEW_OWN: "commissions.viewOwn",

  // POS & payments
  POS_USE: "pos.use",
  CHECKOUT_CLIENTS: "checkout.clients",
  PAYMENTS_VIEW: "payments.view",
  REFUNDS_ISSUE: "refunds.issue",
  DISCOUNTS_APPLY: "discounts.apply",
  VOID_TRANSACTIONS: "void.transactions",
  CASH_DRAWER_VIEW: "cashDrawer.view",
  CASH_DRAWER_CLOSE: "cashDrawer.close",

  // Marketing
  MARKETING_SMS: "marketing.sms",
  MARKETING_EMAIL: "marketing.email",
  REVIEW_REQUESTS: "marketing.reviewRequests",

  // Engagement
  GIFT_CARDS_MANAGE: "giftCards.manage",
  LOYALTY_MANAGE: "loyalty.manage",
  INTAKE_FORMS_MANAGE: "intakeForms.manage",

  // Store / business config
  STORE_SETTINGS: "store.settings",
  STORE_DELETE: "store.delete",
  INTEGRATIONS_MANAGE: "integrations.manage",
  BILLING_MANAGE: "billing.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type Role = "owner" | "manager" | "staff";

// -----------------------------------------------------------------------------
// Role defaults
// -----------------------------------------------------------------------------

const ALL_PERMS: Permission[] = Object.values(PERMISSIONS);

const OWNER_PERMS: Permission[] = ALL_PERMS;

const MANAGER_PERMS: Permission[] = ALL_PERMS.filter(
  (p) =>
    p !== PERMISSIONS.BILLING_MANAGE &&
    p !== PERMISSIONS.STORE_DELETE &&
    p !== PERMISSIONS.STAFF_PERMISSIONS_MANAGE &&
    p !== PERMISSIONS.VOID_TRANSACTIONS,
);

const STAFF_PERMS: Permission[] = [
  PERMISSIONS.APPOINTMENTS_VIEW_OWN,
  PERMISSIONS.APPOINTMENTS_EDIT,
  PERMISSIONS.APPOINTMENTS_MARK_COMPLETE,
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.CUSTOMERS_VIEW_CONTACT,
  PERMISSIONS.PRICING_VIEW,
  PERMISSIONS.POS_USE,
  PERMISSIONS.CHECKOUT_CLIENTS,
  PERMISSIONS.DISCOUNTS_APPLY,
  PERMISSIONS.COMMISSIONS_VIEW_OWN,
  PERMISSIONS.WAITLIST_ACCESS,
];

export const ROLE_DEFAULTS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(OWNER_PERMS),
  manager: new Set(MANAGER_PERMS),
  staff: new Set(STAFF_PERMS),
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Normalize legacy / unknown role values to a supported Role. */
export function normalizeRole(role: string | null | undefined): Role {
  if (role === "manager") return "manager";
  if (role === "staff") return "staff";
  return "owner";
}

/**
 * Compute the effective permission set for a user.
 * Per-user overrides win over role defaults: { "billing.manage": false } removes it,
 * { "reports.financial": true } grants it.
 */
export function computePermissions(
  role: string | null | undefined,
  overrides?: Record<string, boolean> | null,
): Set<Permission> {
  const normalizedRole = normalizeRole(role);
  const set = new Set<Permission>(ROLE_DEFAULTS[normalizedRole]);

  if (overrides) {
    for (const [perm, granted] of Object.entries(overrides)) {
      if (granted) set.add(perm as Permission);
      else set.delete(perm as Permission);
    }
  }

  return set;
}

/** Check whether a permission set includes a permission. */
export function hasPermission(
  perms: Set<Permission> | ReadonlySet<Permission>,
  perm: Permission,
): boolean {
  return perms.has(perm);
}
