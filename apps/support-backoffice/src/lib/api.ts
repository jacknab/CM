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

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request("/auth/me"),
    logout: () => request("/auth/logout", { method: "POST" }),
  },
  search: (q: string) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  agents: {
    list: () => request<SupportAgentItem[]>("/agents"),
  },
  dashboard: {
    stats:         () => request<any>("/dashboard/stats"),
    serviceHealth: () => request<any[]>("/service-health"),
    charts:        () => request<any>("/dashboard/charts"),
    team:          () => request<any>("/dashboard/team"),
    attention:     (tab?: string) => request<any>(`/dashboard/attention${tab ? `?tab=${tab}` : ""}`),
    alerts:        () => request<any[]>("/dashboard/alerts"),
    recentActivity:() => request<any[]>("/dashboard/recent-activity"),
    sla:           () => request<any>("/dashboard/sla"),
  },
  subscriptions: {
    list: () => request<any[]>("/subscriptions"),
  },
  accounts: {
    overview:    (id: number) => request<AccountOverview>(`/accounts/${id}/overview`),
    notes:       (id: number) => request<Note[]>(`/accounts/${id}/notes`),
    addNote:     (id: number, content: string) =>
      request(`/accounts/${id}/notes`, { method: "POST", body: JSON.stringify({ content }) }),
    tickets:     (id: number) => request<Ticket[]>(`/accounts/${id}/tickets`),
    createTicket: (id: number, data: { subject: string; description?: string; priority?: string }) =>
      request(`/accounts/${id}/tickets`, { method: "POST", body: JSON.stringify(data) }),
    tags:        (id: number) => request<Tag[]>(`/accounts/${id}/tags`),
    addTag:      (id: number, tag: string, color = "slate") =>
      request(`/accounts/${id}/tags`, { method: "POST", body: JSON.stringify({ tag, color }) }),
    removeTag:   (id: number, tagId: number) =>
      request(`/accounts/${id}/tags/${tagId}`, { method: "DELETE" }),
    owners:      (id: number) => request<Owner[]>(`/accounts/${id}/owners`),
    suspend:     (id: number) => request(`/accounts/${id}/suspend`,      { method: "POST" }),
    unsuspend:   (id: number) => request(`/accounts/${id}/unsuspend`,    { method: "POST" }),
    extendTrial: (id: number, days: number) =>
      request(`/accounts/${id}/extend-trial`, { method: "POST", body: JSON.stringify({ days }) }),
    resetSms:    (id: number) => request(`/accounts/${id}/reset-sms`,    { method: "POST" }),
    resetAi:     (id: number) => request(`/accounts/${id}/reset-ai`,     { method: "POST" }),
    resetPassword:(id: number) => request(`/accounts/${id}/reset-password`, { method: "POST" }),
    magicLink:   (id: number) => request<{ link: string }>(`/accounts/${id}/magic-link`, { method: "POST" }),
    forceLogout: (id: number) => request(`/accounts/${id}/force-logout`, { method: "POST" }),
    issueCredit: (id: number, amount: number, reason: string) =>
      request(`/billing/${id}/apply-credit`, { method: "POST", body: JSON.stringify({ amount, reason }) }),
    healthCheck: {
      run:          (id: number, segments?: string[]) =>
        request<any>(`/accounts/${id}/health-check${segments?.length ? `?segments=${segments.join(",")}` : ""}`, { method: "POST" }),
      latest:       (id: number) => request<any>(`/accounts/${id}/health-check/latest`),
      history:      (id: number) => request<any[]>(`/accounts/${id}/health-check/history`),
      get:          (id: number, runId: number) => request<any>(`/accounts/${id}/health-check/${runId}`),
      updateNotes:  (id: number, runId: number, notes: string) =>
        request<{ ok: boolean }>(`/accounts/${id}/health-check/${runId}`, { method: "PATCH", body: JSON.stringify({ notes }) }),
      rerunSegment: (id: number, runId: number, segmentId: string) =>
        request<any>(`/accounts/${id}/health-check/${runId}/segment/${segmentId}`, { method: "POST" }),
    },
    aiReceptionist: (id: number) => request<AiReceptionistData>(`/accounts/${id}/ai-receptionist`),
    aiReceptionistProvision: (id: number) =>
      request<{ success: boolean; phoneNumber: string; webhookUrl: string }>(`/accounts/${id}/ai-receptionist/provision`, { method: "POST" }),
    booking: (id: number) => request<any>(`/accounts/${id}/booking`),
    website: (id: number) => request<any>(`/accounts/${id}/website`),
    communications: (id: number) => request<any>(`/accounts/${id}/communications`),
    sendEmail: (id: number, subject: string, message: string) =>
      request<{ ok: boolean; email: string; message: string }>(`/accounts/${id}/send-email`, { method: "POST", body: JSON.stringify({ subject, message }) }),
  },
  tickets: {
    list: (params: TicketListParams) => {
      const qs = new URLSearchParams();
      if (params.filter)  qs.set("filter",  params.filter);
      if (params.search)  qs.set("search",  params.search);
      if (params.page)    qs.set("page",    String(params.page));
      if (params.status)  qs.set("status",  params.status);
      if (params.priority) qs.set("priority", params.priority);
      return request<{ tickets: Ticket[]; total: number }>(`/tickets?${qs}`);
    },
    get: (id: number) => request<TicketDetail>(`/tickets/${id}`),
    update: (id: number, data: Partial<{ status: string; priority: string; category: string; subcategory: string; assignedAgentId: number | null }>) =>
      request(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    addMessage: (id: number, content: string, isInternal: boolean) =>
      request<TicketMessage>(`/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ content, isInternal }) }),
    tasks: (id: number) => request<Task[]>(`/tickets/${id}/tasks`),
    addTask: (id: number, data: { title: string; description?: string; assignedTo?: number; dueDate?: string }) =>
      request<Task>(`/tickets/${id}/tasks`, { method: "POST", body: JSON.stringify(data) }),
    updateTask: (ticketId: number, taskId: number, data: Partial<{ status: string; title: string; assignedTo: number }>) =>
      request(`/tickets/${ticketId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteTask: (ticketId: number, taskId: number) =>
      request(`/tickets/${ticketId}/tasks/${taskId}`, { method: "DELETE" }),
    escalate: (id: number, data: { reason: string; team?: string; level?: number }) =>
      request(`/tickets/${id}/escalate`, { method: "POST", body: JSON.stringify(data) }),
    escalations: (id: number) => request<Escalation[]>(`/tickets/${id}/escalations`),
    related: (id: number) => request<Ticket[]>(`/tickets/${id}/related`),
  },
  macros: {
    list: () => request<Macro[]>("/macros"),
    create: (data: { title: string; content: string; category?: string }) =>
      request<Macro>("/macros", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/macros/${id}`, { method: "DELETE" }),
  },
  errorCodes: {
    list: () => request<Record<string, ErrorCodeEntry>>("/error-codes"),
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AiCallRecord {
  id: number;
  callSid: string | null;
  callerPhone: string | null;
  callerName: string | null;
  outcome: string;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  appointmentId: number | null;
  totalCost: number | null;
  twilioCost: number | null;
  openaiCost: number | null;
  terminationReason: string | null;
  toolCallCount: number | null;
}

export interface AiReceptionistData {
  phoneNumber: string | null;
  enabled: boolean;
  setupDate: string | null;
  monthsActive: number;
  totalSpent: number;
  periodSpent: number;
  totalCalls: number;
  totalMinutes: number;
  bookedCalls: number;
  webhookUrl: string | null;
  calls: AiCallRecord[];
}

export interface Agent {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  name: string;
}

export interface SupportAgentItem {
  id: number;
  email: string;
  name: string;
  role: string;
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
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
    timezone?: string | null;
    category?: string | null;
    bookingSlug?: string | null;
    accountStatus?: string | null;
    smsTokens?: number;
    smsAllowance?: number;
    platformCredits?: string | null;
    account_id?: string | null;
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
  type?: string;
  category: string;
  title: string;
  subtitle: string | null;
  metadata?: Record<string, any>;
  occurred_at: string;
  actor?: string | null;
  actor_name?: string | null;
  actor_type?: string | null;
  severity?: "info" | "warning" | "critical";
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
  subcategory: string | null;
  account_name?: string;
  assigned_agent_id: number | null;
  assigned_agent_name: string | null;
  first_response_at: string | null;
  last_response_at: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface TicketDetail {
  ticket: Ticket & {
    account_name_resolved?: string;
    owner_email?: string;
    owner_first?: string;
    owner_last?: string;
    owner_name?: string;
    plan_name?: string;
    account_status?: string;
    account_id_display?: string;
    source?: string | null;
  };
  messages: TicketMessage[];
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  author_type: string;
  author_name: string;
  agent_id: number | null;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface Task {
  id: number;
  ticket_id: number;
  assigned_to: number | null;
  assigned_name: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Escalation {
  id: number;
  ticket_id: number;
  escalation_level: number;
  assigned_team: string;
  reason: string;
  created_by: number;
  created_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Macro {
  id: number;
  title: string;
  content: string;
  category: string;
  is_shared: boolean;
  created_at: string;
}

export interface ErrorCodeEntry {
  code: string;
  numeric: string;
  title: string;
  description: string;
  causes: string[];
  resolution: string[];
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

export interface TicketListParams {
  filter?: string;
  search?: string;
  page?: number;
  status?: string;
  priority?: string;
}
