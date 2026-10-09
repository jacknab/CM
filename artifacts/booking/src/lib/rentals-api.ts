import { apiRequest } from "@/lib/queryClient";
import type { RentalSpace, RentalProfessional, RentalAgreement } from "@shared/schema";
import type { SpaceStatus } from "@shared/rentalSpaces";
import type { ProfessionalStatus, SocialLink } from "@shared/rentalProfessionals";
import type { AgreementLifecycle, RentFrequency } from "@shared/rentalAgreements";

export interface SpaceWithOccupant extends RentalSpace {
  currentProfessional: { id: number; name: string; businessName: string | null } | null;
}

export interface SpaceConflict {
  id: number;
  professionalName: string;
  startDate: string | null;
  endDate: string | null;
}

export interface SpaceWithAvailability extends SpaceWithOccupant {
  conflict: SpaceConflict | null;
}

export interface SpaceDetail extends SpaceWithOccupant {
  agreement: { id: number; startDate: string | null; endDate: string | null; rentAmount: string | null; rentFrequency: string } | null;
}

export interface SpaceFilters {
  search?: string;
  status?: string;
  type?: string;
}

export function spacesQueryKey(filters: SpaceFilters) {
  return ["/api/rentals/spaces", filters.search ?? "", filters.status ?? "", filters.type ?? ""] as const;
}

export async function fetchSpaces(filters: SpaceFilters): Promise<SpaceWithOccupant[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  const qs = params.toString();
  const res = await fetch(`/api/rentals/spaces${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

/** Spaces annotated with whether they conflict with a proposed Agreement's dates — for the Add Lease Space picker. */
export async function fetchSpacesForDates(startDate: string, endDate: string | null): Promise<SpaceWithAvailability[]> {
  const params = new URLSearchParams({ forStart: startDate });
  if (endDate) params.set("forEnd", endDate);
  const res = await fetch(`/api/rentals/spaces?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface SpaceFormValues {
  name: string;
  type: string;
  monthlyRate?: string | null;
  baseRatePeriodDays?: number;
  description?: string | null;
  notes?: string | null;
  amenities?: string[];
  status?: string;
}

export async function fetchSpace(id: number): Promise<SpaceDetail> {
  const res = await fetch(`/api/rentals/spaces/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function createSpace(values: SpaceFormValues): Promise<SpaceWithOccupant> {
  const res = await apiRequest("POST", "/api/rentals/spaces", values);
  return res.json();
}

export async function updateSpace(id: number, values: Partial<SpaceFormValues>): Promise<RentalSpace> {
  const { status: _status, ...rest } = values;
  const res = await apiRequest("PATCH", `/api/rentals/spaces/${id}`, rest);
  return res.json();
}

export async function changeSpaceStatus(id: number, status: SpaceStatus): Promise<RentalSpace> {
  const res = await apiRequest("PATCH", `/api/rentals/spaces/${id}/status`, { status });
  return res.json();
}

// ─── Facility Settings ───────────────────────────────────────────────────────

export interface FacilitySettings {
  name: string;
  timezone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

export type FacilitySettingsFormValues = Partial<Omit<FacilitySettings, "timezone">>;

export async function fetchFacilitySettings(): Promise<FacilitySettings> {
  const res = await fetch("/api/rentals/settings", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateFacilitySettings(values: FacilitySettingsFormValues): Promise<FacilitySettings> {
  const res = await apiRequest("PATCH", "/api/rentals/settings", values);
  return res.json();
}

// ─── Professionals ──────────────────────────────────────────────────────────

export interface ProfessionalWithSpace extends RentalProfessional {
  currentSpace: { id: number; name: string; type: string } | null;
}

export interface ProfessionalDetail extends RentalProfessional {
  currentSpace: { id: number; name: string; type: string; status: string } | null;
  agreement: {
    id: number;
    startDate: string | null;
    endDate: string | null;
    rentAmount: string | null;
    rentFrequency: string;
    lifecycle: AgreementLifecycle;
  } | null;
}

export interface ProfessionalFilters {
  search?: string;
  status?: string;
  hasSpace?: "true" | "false";
}

export function professionalsQueryKey(filters: ProfessionalFilters) {
  return ["/api/rentals/professionals", filters.search ?? "", filters.status ?? "", filters.hasSpace ?? ""] as const;
}

export async function fetchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalWithSpace[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.hasSpace) params.set("hasSpace", filters.hasSpace);
  const qs = params.toString();
  const res = await fetch(`/api/rentals/professionals${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchProfessional(id: number): Promise<ProfessionalDetail> {
  const res = await fetch(`/api/rentals/professionals/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface ProfessionalFormValues {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  socialLinks?: SocialLink[];
  notes?: string | null;
  status?: string;
}

export async function createProfessional(values: ProfessionalFormValues): Promise<ProfessionalWithSpace> {
  const res = await apiRequest("POST", "/api/rentals/professionals", values);
  return res.json();
}

export async function updateProfessional(id: number, values: Partial<ProfessionalFormValues>): Promise<RentalProfessional> {
  const { status: _status, ...rest } = values;
  const res = await apiRequest("PATCH", `/api/rentals/professionals/${id}`, rest);
  return res.json();
}

export async function changeProfessionalStatus(id: number, status: ProfessionalStatus): Promise<RentalProfessional> {
  const res = await apiRequest("PATCH", `/api/rentals/professionals/${id}/status`, { status });
  return res.json();
}

// ─── Leases / Rental Agreements ──────────────────────────────────────────────

export interface AgreementWithRelations extends RentalAgreement {
  lifecycle: AgreementLifecycle;
  space: { id: number; name: string; type: string };
  professional: { id: number; name: string; businessName: string | null };
  // Only present on the single-agreement fetch (GET /leases/:id), not the list.
  rentSummary?: { currentBalance: string; nextDue: { dueDate: string; amount: string } | null };
}

export interface LeaseFilters {
  search?: string;
  status?: string; // derived lifecycle value
  spaceId?: number;
  professionalId?: number;
  frequency?: string;
}

export function leasesQueryKey(filters: LeaseFilters) {
  return [
    "/api/rentals/leases",
    filters.search ?? "", filters.status ?? "", filters.spaceId ?? "", filters.professionalId ?? "", filters.frequency ?? "",
  ] as const;
}

export async function fetchLeases(filters: LeaseFilters): Promise<AgreementWithRelations[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.spaceId) params.set("spaceId", String(filters.spaceId));
  if (filters.professionalId) params.set("professionalId", String(filters.professionalId));
  if (filters.frequency) params.set("frequency", filters.frequency);
  const qs = params.toString();
  const res = await fetch(`/api/rentals/leases${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchLease(id: number): Promise<AgreementWithRelations> {
  const res = await fetch(`/api/rentals/leases/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface CreateLeaseValues {
  professionalId: number;
  spaceId: number;
  startDate: string;
  endDate?: string | null;
  rentAmount: string;
  rentFrequency: RentFrequency;
  depositAmount?: string | null;
  noticePeriodDays?: number | null;
  notes?: string | null;
}

export type LeaseTermsValues = Omit<CreateLeaseValues, "professionalId" | "spaceId">;

// Lease mutations use a bespoke fetch wrapper rather than apiRequest() —
// apiRequest's error throws `Error("${status}: ${rawBodyText}")`, which would
// bury the server's human-readable message (e.g. "This space is already
// rented by...") inside a raw JSON string. Overlap/validation errors here are
// meant to be shown to the user directly (Phase 4 Section 30), so this reads
// the `error` field out cleanly instead.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export async function createLease(values: CreateLeaseValues): Promise<AgreementWithRelations> {
  const res = await fetch("/api/rentals/leases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json();
}

export async function updateLease(id: number, values: Partial<LeaseTermsValues>): Promise<AgreementWithRelations> {
  const res = await fetch(`/api/rentals/leases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json();
}

export async function terminateLease(id: number, effectiveDate?: string, reason?: string): Promise<AgreementWithRelations> {
  const res = await fetch(`/api/rentals/leases/${id}/terminate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ effectiveDate, reason: reason || undefined }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json();
}

export interface RenewLeaseValues extends Partial<LeaseTermsValues> {
  startDate: string;
  endPreviousAgreement?: boolean;
}

export async function renewLease(id: number, values: RenewLeaseValues): Promise<AgreementWithRelations> {
  const res = await fetch(`/api/rentals/leases/${id}/renew`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json();
}

// ─── Rent Charges & Payments (Phase 5 — manual payments only, no Stripe yet) ─

export interface RentPaymentRecord {
  id: number;
  chargeId: number;
  amount: string;
  method: "cash" | "check" | "other";
  reference: string | null;
  paidAt: string;
  notes: string | null;
}

export interface RentChargeWithRelations {
  id: number;
  agreementId: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string;
  currency: string;
  status: "unpaid" | "paid" | "voided";
  voidedAt: string | null;
  voidedReason: string | null;
  displayState: "upcoming" | "due" | "overdue" | "paid" | "voided";
  paidAmount: string;
  remainingAmount: string;
  space: { id: number; name: string };
  professional: { id: number; name: string; businessName: string | null };
}

export interface RentChargeDetail extends RentChargeWithRelations {
  payments: RentPaymentRecord[];
}

export interface RentChargeFilters {
  search?: string;
  status?: string; // displayState value
  professionalId?: number;
  spaceId?: number;
}

export function rentChargesQueryKey(filters: RentChargeFilters) {
  return [
    "/api/rentals/rent/charges",
    filters.search ?? "", filters.status ?? "", filters.professionalId ?? "", filters.spaceId ?? "",
  ] as const;
}

export async function fetchRentCharges(filters: RentChargeFilters): Promise<RentChargeWithRelations[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.professionalId) params.set("professionalId", String(filters.professionalId));
  if (filters.spaceId) params.set("spaceId", String(filters.spaceId));
  const qs = params.toString();
  const res = await fetch(`/api/rentals/rent/charges${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchRentCharge(id: number): Promise<RentChargeDetail> {
  const res = await fetch(`/api/rentals/rent/charges/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface RecordManualPaymentValues {
  amount: string;
  method: "cash" | "check" | "other";
  reference?: string | null;
  paidAt?: string;
  notes?: string | null;
}

export async function recordManualPayment(chargeId: number, values: RecordManualPaymentValues) {
  const res = await fetch(`/api/rentals/rent/charges/${chargeId}/manual-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json() as Promise<{ payment: RentPaymentRecord; chargeStatus: string; remainingAmount: string }>;
}

export async function voidRentCharge(chargeId: number, reason?: string): Promise<RentChargeWithRelations> {
  const res = await fetch(`/api/rentals/rent/charges/${chargeId}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason: reason || undefined }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `${res.status}: ${res.statusText}`));
  return res.json();
}
