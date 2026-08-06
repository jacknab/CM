import { loadUser, saveUser, clearUser } from './storage';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:9200';

export type AppMode = 'owner-tablet' | 'owner-phone' | 'solo';

export type PosUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  storeId: number;
  storeName: string;
  role: string;
  soloMode: boolean;
  stripeConnected: boolean;
  avatarUrl?: string;
};

export type Appointment = {
  id: number;
  clientName: string;
  clientId: number | null;
  staffId: number | null;
  staffName: string | null;
  serviceName: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled';
  notes: string | null;
  price: number;
  color?: string;
};

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
  color?: string;
};

export type Service = {
  id: number;
  name: string;
  duration: number;
  price: number;
  category: string | null;
  description: string | null;
};

export type Client = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  loyaltyPoints: number;
  notes: string | null;
  avatarUrl?: string | null;
};

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
  rememberMe = true,
): Promise<PosUser> {
  const data = await fetchApi<{ user: PosUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (rememberMe) await saveUser(data.user);
  else await clearUser();
  return data.user;
}

export async function logout(): Promise<void> {
  await fetchApi('/api/auth/logout', { method: 'POST' }).catch(() => {});
  await clearUser();
}

export async function getStoredUser(): Promise<PosUser | null> {
  return loadUser<PosUser>();
}

export async function fetchCurrentUser(): Promise<PosUser> {
  const data = await fetchApi<{ user: PosUser }>('/api/auth/user');
  await saveUser(data.user);
  return data.user;
}

export async function fetchAppointments(storeId: number, date: string): Promise<Appointment[]> {
  return fetchApi<Appointment[]>(`/api/appointments?storeId=${storeId}&date=${date}`);
}

export async function fetchStaff(storeId: number): Promise<StaffMember[]> {
  return fetchApi<StaffMember[]>(`/api/staff?storeId=${storeId}`);
}

export async function fetchServices(storeId: number): Promise<Service[]> {
  return fetchApi<Service[]>(`/api/services?storeId=${storeId}`);
}

export async function fetchClients(storeId: number, query?: string): Promise<Client[]> {
  const q = query ? `&query=${encodeURIComponent(query)}` : '';
  return fetchApi<Client[]>(`/api/clients?storeId=${storeId}${q}`);
}

export async function updateAppointmentStatus(
  appointmentId: number,
  status: Appointment['status'],
): Promise<void> {
  await fetchApi(`/api/appointments/${appointmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchStripeConnectStatus(storeId: number): Promise<{
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountId: string | null;
}> {
  return fetchApi(`/api/payments/stripe/status?storeId=${storeId}`);
}

export async function fetchConnectionToken(storeId: number): Promise<{ secret: string }> {
  return fetchApi('/api/payments/terminal/connection-token', {
    method: 'POST',
    body: JSON.stringify({ storeId }),
  });
}

export async function createPaymentIntent(params: {
  storeId: number;
  amount: number;
  tipAmount?: number;
  clientId?: number | null;
  appointmentId?: number | null;
}): Promise<{ paymentIntentId: string; clientSecret: string }> {
  return fetchApi('/api/payments/terminal/create-payment-intent', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function capturePaymentIntent(paymentIntentId: string): Promise<{ success: boolean }> {
  return fetchApi('/api/payments/terminal/capture-payment-intent', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}

export async function confirmManualPayment(params: {
  storeId: number;
  paymentMethodId: string;
  amount: number;
  tipAmount?: number;
  clientId?: number | null;
  appointmentId?: number | null;
}): Promise<{ success: boolean; paymentIntentId: string }> {
  return fetchApi('/api/payments/confirm-manual', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function toggleSoloMode(storeId: number, soloMode: boolean): Promise<void> {
  await fetchApi('/api/settings/solo-mode', {
    method: 'PATCH',
    body: JSON.stringify({ storeId, soloMode }),
  });
}

export async function fetchClient(storeId: number, clientId: number): Promise<Client> {
  return fetchApi<Client>(`/api/clients/${clientId}?storeId=${storeId}`);
}

export async function createClient(data: {
  storeId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}): Promise<Client> {
  return fetchApi<Client>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  clientId: number,
  storeId: number,
  data: Partial<Omit<Client, 'id' | 'loyaltyPoints'>>,
): Promise<Client> {
  return fetchApi<Client>(`/api/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify({ storeId, ...data }),
  });
}

export async function fetchClientAppointments(storeId: number, clientId: number): Promise<Appointment[]> {
  return fetchApi<Appointment[]>(`/api/appointments?storeId=${storeId}&clientId=${clientId}`);
}

export async function fetchAppointmentsByRange(storeId: number, startDate: string, endDate: string): Promise<Appointment[]> {
  return fetchApi<Appointment[]>(`/api/appointments?storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`);
}

export async function createAppointment(data: {
  storeId: number;
  clientId: number | null;
  staffId: number | null;
  serviceId: number;
  startTime: string;
  endTime: string;
  notes: string | null;
  status?: string;
}): Promise<Appointment> {
  return fetchApi<Appointment>('/api/appointments', {
    method: 'POST',
    body: JSON.stringify({ ...data, status: data.status ?? 'confirmed' }),
  });
}
