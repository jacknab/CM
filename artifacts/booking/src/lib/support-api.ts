const BASE = "/api/support";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const supportApi = {
  auth: {
    login: (email: string, password: string) =>
      request<SupportAgent>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request<SupportAgent>("/auth/me"),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  },
  search: (q: string) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  accounts: {
    overview:    (id: number) => request<AccountOverview>(`/accounts/${id}/overview`),
    timeline:    (id: number, category = "all", search = "", offset = 0) =>
      request(`/accounts/${id}/timeline?category=${category}&search=${encodeURIComponent(search)}&offset=${offset}&limit=50`),
    notes:       (id: number) => request<Note[]>(`/accounts/${id}/notes`),
    addNote:     (id: number, content: string) =>
      request(`/accounts/${id}/notes`, { method: "POST", body: JSON.stringify({ content }) }),
    tickets:     (id: number) => request<Ticket[]>(`/accounts/${id}/tickets`),
    createTicket:(id: number, data: { subject: string; description?: string; priority?: string }) =>
      request(`/accounts/${id}/tickets`, { method: "POST", body: JSON.stringify(data) }),
    tags:        (id: number) => request<Tag[]>(`/accounts/${id}/tags`),
    addTag:      (id: number, tag: string, color = "slate") =>
      request(`/accounts/${id}/tags`, { method: "POST", body: JSON.stringify({ tag, color }) }),
    removeTag:   (id: number, tagId: number) =>
      request(`/accounts/${id}/tags/${tagId}`, { method: "DELETE" }),
    owners:      (id: number) => request<Owner[]>(`/accounts/${id}/owners`),
    suspend:     (id: number) => request(`/accounts/${id}/suspend`,     { method: "POST" }),
    unsuspend:   (id: number) => request(`/accounts/${id}/unsuspend`,   { method: "POST" }),
    extendTrial: (id: number, days: number) =>
      request(`/accounts/${id}/extend-trial`, { method: "POST", body: JSON.stringify({ days }) }),
    resetSms:    (id: number) => request(`/accounts/${id}/reset-sms`,   { method: "POST" }),
    magicLink:   (id: number) => request<{ ok: boolean; link: string; expiresIn: string }>(`/accounts/${id}/magic-link`, { method: "POST" }),
    forceLogout: (id: number) => request<{ ok: boolean; message: string }>(`/accounts/${id}/force-logout`, { method: "POST" }),
    resetPassword:(id: number) => request<{ ok: boolean; email: string; message: string }>(`/accounts/${id}/reset-password`, { method: "POST" }),
    sendEmail:   (id: number, subject: string, message: string) =>
      request<{ ok: boolean; email: string; message: string }>(`/accounts/${id}/send-email`, { method: "POST", body: JSON.stringify({ subject, message }) }),
    booking:     (id: number) => request<BookingOverview>(`/accounts/${id}/booking`),
    communications:(id: number) => request<CommunicationsData>(`/accounts/${id}/communications`),
    website:     (id: number) => request<WebsiteData>(`/accounts/${id}/website`),
    healthCheck: {
      run: (id: number, segments?: string[]) =>
        request<any>(`/accounts/${id}/health-check${segments?.length ? `?segments=${segments.join(",")}` : ""}`, { method: "POST" }),
      latest: (id: number) => request<any>(`/accounts/${id}/health-check/latest`),
      history: (id: number) => request<any[]>(`/accounts/${id}/health-check/history`),
      get: (id: number, runId: number) => request<any>(`/accounts/${id}/health-check/${runId}`),
      updateNotes: (id: number, runId: number, notes: string) =>
        request<{ ok: boolean }>(`/accounts/${id}/health-check/${runId}`, { method: "PATCH", body: JSON.stringify({ notes }) }),
      rerunSegment: (id: number, runId: number, segmentId: string) =>
        request<any>(`/accounts/${id}/health-check/${runId}/segment/${segmentId}`, { method: "POST" }),
    },
    /** Returns a pre-built URL string for triggering a CSV download directly. */
    exportActivityUrl:(id: number, range: string, category: string, customFrom?: string, customTo?: string) => {
      const p = new URLSearchParams({ range, category, format: "csv" });
      if (customFrom) p.set("from", customFrom);
      if (customTo)   p.set("to", customTo);
      return `${BASE}/accounts/${id}/activity/export?${p}`;
    },
  },
  tickets: {
    list: (filter = "my_open", search = "", page = 1) =>
      request<TicketListResponse>(`/tickets?filter=${filter}&search=${encodeURIComponent(search)}&page=${page}`),
    get: (id: number) => request<TicketDetailResponse>(`/tickets/${id}`),
    addMessage: (id: number, content: string, isInternal = false, sendEmail = false) =>
      request<TicketMessage & { emailSent?: boolean; emailError?: string | null; smtpAvailable?: boolean }>(
        `/tickets/${id}/messages`,
        { method: "POST", body: JSON.stringify({ content, isInternal, sendEmail }) }
      ),
    update: (id: number, data: Partial<{ status: string; priority: string; category: string; subcategory: string; assignedAgentId: number }>) =>
      request(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    linkAccount: (id: number, accountId: number) =>
      request<{ ok: boolean }>(`/tickets/${id}/link-account`, { method: "POST", body: JSON.stringify({ accountId }) }),
    rescanInbox: (days = 30) =>
      request<{ ok: boolean; scanned: number; errors: string[] }>(`/email-rescan`, { method: "POST", body: JSON.stringify({ days }) }),
    emailStatus: () =>
      request<EmailSyncStatus>(`/email-status`),
  },
};

export interface EmailSyncStatus {
  running: boolean;
  connected: boolean;
  imapPasswordSet: boolean;
  imapUser: string;
  lastPollAt: string | null;
  lastPollNew: number;
  lastPollSeen: number;
  lastPollError: string | null;
  recentMessageErrors: string[];
  totalProcessed: number;
  pollCount: number;
  pollIntervalMs: number;
  processedEmailsTableRows: number | string;
  emailTicketsInDb: number;
  schemaCheck?: {
    missingTicketCols: string[];
    missingMsgCols: string[];
    issueIsNotNull: boolean;
    ok: boolean;
  };
}

export interface SupportAgent {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  name: string;
}

export interface SearchResult {
  id: number;
  businessName: string;
  phone: string;
  businessEmail: string;
  bookingSlug: string;
  accountStatus: string;
  city: string;
  state: string;
  category: string;
  ownerEmail: string;
  ownerName: string;
  subscriptionStatus: string;
  planName: string;
  priceCents: number;
  signupDate: string;
  trialEndsAt: string | null;
}

export interface AccountOverview {
  store: {
    id: number;
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    postcode: string;
    timezone: string;
    category: string;
    bookingSlug: string;
    accountStatus: string;
    smsTokens: number;
    smsAllowance: number;
    platformCredits: string;
  };
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    signupDate: string;
    subscriptionStatus: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    profileImageUrl: string | null;
    lastLoginAt: string | null;
  };
  subscription: {
    planCode: string;
    planName: string;
    priceCents: number;
    interval: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentBrand: string | null;
    paymentLast4: string | null;
    renewalDate: string | null;
  } | null;
  stats: {
    appointmentsThisMonth: number;
    smsSentThisMonth: number;
    aiCallsThisMonth: number;
    aiBookingsThisMonth: number;
    aiMinutesThisMonth: number;
    aiCostThisMonth: number;
    staffCount: number;
  };
  health: {
    booking: string;
    sms: string;
    email: string;
    ai: string;
    google: string;
    website: string;
    domain: string;
  };
}

export interface ActivityEvent {
  id?: string;
  type: string;
  category: string;
  title: string;
  subtitle: string | null;
  metadata?: Record<string, any>;
  occurred_at: string;
  actor: string | null;
}

export interface Note {
  id: number;
  account_id: number;
  agent_id: number;
  agent_name: string;
  content: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  account_id: number;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  channel: string | null;
  customer_email: string | null;
  assigned_agent_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  author_type: string;
  author_name: string;
  agent_id: number | null;
  content: string;
  is_internal: boolean;
  direction: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  description: string | null;
  subcategory: string | null;
  source: string | null;
  account_name_resolved: string;
  business_email: string;
  business_phone: string;
  owner_email: string;
  owner_first: string;
  owner_last: string;
  plan_name: string;
  assigned_agent_full_name: string | null;
  account_status: string;
  first_response_at: string | null;
  last_response_at: string | null;
  customer_email: string | null;
}

export interface TicketListItem extends Ticket {
  account_name: string;
  message_count: number;
}

export interface TicketListResponse {
  tickets: TicketListItem[];
  total: number;
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
  messages: TicketMessage[];
}

export interface Tag {
  id: number;
  account_id: number;
  tag: string;
  color: string;
  created_at: string;
}

export interface Owner {
  id: string;
  email: string;
  name: string;
  role: string;
  profileImageUrl?: string;
}

export interface BookingOverview {
  bookingSlug: string | null;
  stats: {
    total_30d: number;
    completed_30d: number;
    cancelled_30d: number;
    no_show_30d: number;
    upcoming: number;
    revenue_30d: number;
  };
  recentAppointments: Array<{
    id: number;
    date: string;
    status: string;
    total_paid: number | null;
    payment_method: string | null;
    service_name: string | null;
    staff_name: string | null;
    client_name: string | null;
  }>;
  upcomingAppointments: Array<{
    date: string;
    service_name: string | null;
    staff_name: string | null;
    client_name: string | null;
  }>;
  services: { count: number; active: number };
  staff: { count: number };
}

export interface CommunicationsData {
  smsLog: Array<{
    id: number;
    sent_at: string;
    message_type: string;
    phone: string;
    status: string;
    sms_source: string | null;
    message_body: string | null;
  }>;
  tickets: Array<{
    id: number;
    ticket_number: string;
    subject: string;
    status: string;
    priority: string;
    channel: string | null;
    created_at: string;
    message_count: number;
  }>;
  smsStats: { total: number; inbound: number; outbound: number; failed: number; last_30d: number };
}

export interface WebsiteData {
  website: {
    id: number;
    name: string;
    published: boolean;
    published_at: string | null;
    custom_domain: string | null;
    assigned_subdomain: string | null;
    created_at: string;
    updated_at: string;
    publisher_type: string | null;
    page_count: number;
  } | null;
  pageViews: { total_views: number; views_30d: number; views_7d: number };
}
