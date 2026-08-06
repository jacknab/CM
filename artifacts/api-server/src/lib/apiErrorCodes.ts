/**
 * API Error Code System
 *
 * Each API error is classified into a structured code.
 * Format: ERRORCODE=NNN  (3 digits, no zeros in any position)
 *
 * Support agents use the numeric value alone (e.g. "347") to look up the
 * meaning, causes, and resolution steps.
 */

export interface ErrorCodeEntry {
  code: string;          // e.g. "ERRORCODE=347"
  numeric: string;       // e.g. "347"
  title: string;
  description: string;
  causes: string[];
  resolution: string[];
}

export const ERROR_CODE_LOOKUP: Record<string, ErrorCodeEntry> = {
  "347": {
    code: "ERRORCODE=347",
    numeric: "347",
    title: "Booking Slot Unavailable",
    description:
      "The requested appointment time could not be confirmed — the staff member or resource is not available during that window.",
    causes: [
      "Staff member is already booked at that time",
      "The time slot falls outside configured business hours",
      "A buffer period is blocking the slot between appointments",
      "The slot was taken by another booking between selection and submission",
    ],
    resolution: [
      "Open the Calendar tab and check for conflicts at the requested time",
      "Verify business hours in Settings → Business Hours",
      "Check buffer/padding settings for the relevant service",
      "Ask the customer to choose an alternative time or staff member",
    ],
  },
  "582": {
    code: "ERRORCODE=582",
    numeric: "582",
    title: "Appointment Not Found",
    description:
      "A requested appointment record could not be located. It may have been deleted, cancelled, or the ID is incorrect.",
    causes: [
      "Appointment was cancelled or deleted",
      "The appointment ID in the URL or request is stale/incorrect",
      "Customer is looking at a link from a different account",
    ],
    resolution: [
      "Search for the appointment in the owner's Calendar or Appointments list",
      "Check if the appointment appears in the cancelled/deleted records",
      "Verify the customer is logged into the correct account",
    ],
  },
  "761": {
    code: "ERRORCODE=761",
    numeric: "761",
    title: "Deposit Payment Failed",
    description:
      "The required deposit payment could not be charged at the time of booking.",
    causes: [
      "Card was declined by the issuer",
      "Stripe Connect account is not properly configured for this salon",
      "Customer's card has insufficient funds or is expired",
      "Payment method was not provided when a deposit is required",
    ],
    resolution: [
      "Check Stripe dashboard for the specific decline reason",
      "Verify the salon's Stripe Connect account is active in Settings → Payments",
      "Ask the customer to use a different payment method",
      "Check if the deposit policy is configured correctly for the service",
    ],
  },
  "293": {
    code: "ERRORCODE=293",
    numeric: "293",
    title: "SMS Credits Exhausted",
    description:
      "The account has run out of SMS allowance and has insufficient platform credits to send the message.",
    causes: [
      "Monthly SMS allowance included in the subscription plan has been used up",
      "Platform credit wallet balance is too low to cover the per-message cost",
      "Unusually high SMS volume this billing period",
    ],
    resolution: [
      "Check remaining SMS allowance in the account's billing details",
      "Issue platform credits from Billing Investigation → Apply Credit",
      "Review SMS usage and advise the customer to upgrade their plan if needed",
      "Check if reminder storms (e.g. bulk send) caused rapid depletion",
    ],
  },
  "854": {
    code: "ERRORCODE=854",
    numeric: "854",
    title: "Invalid Phone / SMS Delivery Failed",
    description:
      "The SMS could not be delivered because the destination phone number is invalid, not reachable, or the carrier rejected the message.",
    causes: [
      "Phone number is not in E.164 format or is missing country code",
      "Number is a landline, VoIP, or not SMS-capable",
      "Carrier blocked the message (short code compliance, content filtering)",
      "Customer has opted out of SMS (STOP keyword)",
    ],
    resolution: [
      "Verify the client's phone number is correct and mobile",
      "Check Twilio delivery logs for the specific carrier error code",
      "If the customer previously sent STOP, they need to send START to re-enable",
      "Confirm the sending number is approved for A2P messaging",
    ],
  },
  "419": {
    code: "ERRORCODE=419",
    numeric: "419",
    title: "Payment Card Declined",
    description:
      "A payment attempt was declined by the card issuer or payment processor.",
    causes: [
      "Insufficient funds on the card",
      "Card is expired or the CVC/ZIP code is incorrect",
      "Issuer's fraud detection flagged the transaction",
      "Card is not enabled for online/international transactions",
    ],
    resolution: [
      "Check Stripe dashboard for the specific decline code and reason",
      "Ask the customer to try a different card or payment method",
      "Advise the customer to contact their bank if the card should be valid",
      "Verify the billing address matches the card on file",
    ],
  },
  "673": {
    code: "ERRORCODE=673",
    numeric: "673",
    title: "Refund Processing Error",
    description:
      "A refund request could not be completed through the payment processor.",
    causes: [
      "Original charge has already been refunded",
      "Refund window has expired (Stripe limits: 90 days)",
      "Stripe Connect account has insufficient balance to cover the refund",
      "The original payment was disputed and is locked",
    ],
    resolution: [
      "Check the original charge in the Stripe dashboard for refund eligibility",
      "If the window has expired, issue a manual credit or alternative refund",
      "Verify the salon's Stripe Connect payout balance",
      "If there's a dispute, the refund must be handled through the dispute process",
    ],
  },
  "528": {
    code: "ERRORCODE=528",
    numeric: "528",
    title: "Availability Engine Error",
    description:
      "An internal error occurred while computing available appointment slots.",
    causes: [
      "Missing or malformed business hours configuration",
      "Staff schedule data is corrupted or missing",
      "Database query timeout under high load",
      "Timezone configuration mismatch for the store",
    ],
    resolution: [
      "Verify business hours are configured in Settings → Business Hours",
      "Check staff schedules for the affected date range",
      "Review API server logs for the specific error stack trace",
      "Confirm the store's timezone is set correctly in Settings → General",
    ],
  },
  "941": {
    code: "ERRORCODE=941",
    numeric: "941",
    title: "Service Not Found",
    description:
      "A requested service could not be found. It may have been deleted or hidden from the public menu.",
    causes: [
      "Service was deleted or archived",
      "Service is hidden from the public booking page",
      "The service ID in a deep link or integration is stale",
      "Service belongs to a different store",
    ],
    resolution: [
      "Check the store's Services list for the missing service",
      "Verify the service is marked as visible/active",
      "Update any external links or integrations with the correct service ID",
    ],
  },
  "187": {
    code: "ERRORCODE=187",
    numeric: "187",
    title: "Authentication Failed",
    description:
      "The request was denied because the user is not authenticated or does not have permission to perform the action.",
    causes: [
      "Session expired — user needs to log in again",
      "Staff member's role does not have the required permission",
      "Token or cookie was cleared (browser privacy mode, cache clear)",
      "Account is suspended and access is blocked",
    ],
    resolution: [
      "Ask the user to log out and log back in",
      "Check the staff member's role and permissions in Staff → Permissions",
      "Verify account status is active (not suspended)",
      "If the account is suspended, use Account Actions to unsuspend if appropriate",
    ],
  },
  "356": {
    code: "ERRORCODE=356",
    numeric: "356",
    title: "AI Receptionist Error",
    description:
      "An error occurred in the AI Receptionist system, such as during a call, booking attempt, or configuration update.",
    causes: [
      "OpenAI API key is not configured or has expired",
      "Twilio webhook is not correctly provisioned for this salon",
      "Call handling encountered an unexpected response from the LLM",
      "The store has no AI Receptionist subscription feature enabled",
    ],
    resolution: [
      "Check the AI Receptionist settings for this account",
      "Verify OpenAI API key is set in the platform secrets",
      "Use Support → AI Receptionist → Provision Webhook to re-apply the Twilio webhook",
      "Review the call log for the specific error detail",
    ],
  },
  "799": {
    code: "ERRORCODE=799",
    numeric: "799",
    title: "Internal Server Error",
    description:
      "An unexpected error occurred on the server while processing the request.",
    causes: [
      "Unhandled exception in the API route handler",
      "Database connection issue or query failure",
      "Missing required data or schema drift",
      "Dependency (third-party service) returned an unexpected error",
    ],
    resolution: [
      "Check the API server logs around the time of the error for the stack trace",
      "Verify the database is healthy via Admin → DB Health",
      "Reproduce the request and note the exact endpoint and payload",
      "Escalate to engineering if the error is persistent",
    ],
  },
  "624": {
    code: "ERRORCODE=624",
    numeric: "624",
    title: "Rate Limit Exceeded",
    description:
      "The account or IP address has sent too many requests in a short time window and has been throttled.",
    causes: [
      "Automated scripts or integrations making excessive API calls",
      "Brute-force login attempts triggering the auth rate limiter",
      "High-frequency polling from a custom integration",
      "Multiple browser tabs making simultaneous requests",
    ],
    resolution: [
      "Wait for the rate limit window to reset (typically 15 minutes for auth, 1 minute for general)",
      "If caused by automation, advise the customer to add delays between requests",
      "Check if a third-party integration is polling too aggressively",
      "For auth rate limits, verify there are no ongoing brute-force attempts",
    ],
  },
};

/**
 * Pattern-match a failed API request and return its error code entry,
 * or undefined if no pattern matches (caller should omit the field).
 */
export function classifyApiError(
  method: string,
  path: string,
  status: number,
  message: string,
): ErrorCodeEntry | undefined {
  const m = message.toLowerCase();
  const p = path.toLowerCase();

  // Rate limit — catch first, applies to any route
  if (status === 429) return ERROR_CODE_LOOKUP["624"];

  // Auth failures
  if (p.includes("/auth") && (status === 401 || status === 403))
    return ERROR_CODE_LOOKUP["187"];

  // Booking: deposit
  if (m.includes("deposit")) return ERROR_CODE_LOOKUP["761"];

  // Booking: slot unavailable
  if (
    (p.includes("/book") || p.includes("/appointment")) &&
    status === 422 &&
    (m.includes("slot") || m.includes("unavailable") || m.includes("available"))
  )
    return ERROR_CODE_LOOKUP["347"];

  // Booking: appointment not found
  if (p.includes("/appointment") && status === 404)
    return ERROR_CODE_LOOKUP["582"];

  // SMS: credits exhausted
  if (p.includes("/sms") && status === 402 && (m.includes("credit") || m.includes("balance") || m.includes("allowance")))
    return ERROR_CODE_LOOKUP["293"];

  // SMS: invalid phone / delivery failure
  if (p.includes("/sms") && (m.includes("invalid phone") || m.includes("undelivered") || m.includes("delivery") || m.includes("invalid number")))
    return ERROR_CODE_LOOKUP["854"];

  // Payments: refund
  if (p.includes("/payment") && m.includes("refund"))
    return ERROR_CODE_LOOKUP["673"];

  // Payments: card declined
  if (p.includes("/payment") && (m.includes("declined") || m.includes("card") || m.includes("insufficient")))
    return ERROR_CODE_LOOKUP["419"];

  // Availability engine
  if (p.includes("/availability") && status === 500)
    return ERROR_CODE_LOOKUP["528"];

  // Service not found
  if (p.includes("/service") && status === 404)
    return ERROR_CODE_LOOKUP["941"];

  // AI receptionist
  if (p.includes("/ai-receptionist") || p.includes("/ai_receptionist"))
    return ERROR_CODE_LOOKUP["356"];

  // Catch-all 500
  if (status === 500) return ERROR_CODE_LOOKUP["799"];

  return undefined;
}
