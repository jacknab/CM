/**
 * Single-instance scheduler guard.
 *
 * In PM2 cluster mode, every worker imports and runs the same startup code.
 * That's correct (and required) for HTTP request handlers, but wrong for
 * interval-based schedulers (SMS/email reminders, GBP sync, payroll, trial
 * emails, etc.) — running those in every worker means every reminder, email,
 * and external API call fires once per worker instead of once total.
 *
 * PM2 sets NODE_APP_INSTANCE to "0", "1", "2"... per worker in cluster mode,
 * and leaves it unset in fork mode — so this is true for the single fork-mode
 * process and for exactly one cluster worker, false everywhere else.
 */
export const IS_SCHEDULER_INSTANCE =
  process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === "0";
