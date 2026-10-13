/**
 * An account created in the Certxa Pro mobile app: one person, one calendar. It has no staff, commission or
 * payroll areas, on the website or in the app, and it is the only kind of account the app signs in.
 * Stored in users.account_type.
 */
export const PRO_ACCOUNT_TYPE = "certxa_pro";

export function isProAccount(accountType: string | null | undefined): boolean {
  return accountType === PRO_ACCOUNT_TYPE;
}

/** Website areas a one-calendar account never sees: staff, commission, payroll and what hangs off them. */
const PRO_HIDDEN_PATHS = [
  "/team", "/staff", "/team-permissions", "/timeclock", "/print-checks",
  "/commissions", "/commission-report", "/payroll", "/payroll-settings", "/payouts",
  "/settings/commission", "/settings/team", "/settings/payroll",
];

export function isHiddenForProAccount(pathname: string): boolean {
  return PRO_HIDDEN_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
