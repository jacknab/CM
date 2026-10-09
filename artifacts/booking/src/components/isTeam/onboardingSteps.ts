import { ONBOARDING_STEPS } from "@/lib/onboarding-script";

// Plain names for the onboarding conversation's steps, for the support team. The ids and their
// order come from lib/onboarding-script.ts.
const STEP_LABELS: Record<string, string> = {
  business_type: "Business type",
  salon_name: "Salon name",
  address: "Address",
  zip_lookup: "ZIP code",
  name_confirm: "Confirm business found on Google",
  phone: "Phone number",
  timezone: "Timezone",
  hours: "Business hours",
  services_intro: "Services introduction",
  services_method: "How to add services",
  services_upload: "Upload service menu",
  services_review: "Review imported services",
  services_manual: "Add services manually",
  google_setup: "Google Business setup",
  team_intro: "Team size",
  team_member_name: "Team member name",
  team_member_email: "Team member email",
  team_member_role: "Team member role",
  team_member_hours: "Team member working hours",
  team_add_more: "Add another team member",
  slot_interval: "Appointment slot length",
  buffer_time: "Time between appointments",
  online_booking: "Online booking on or off",
  advance_window: "How far ahead clients can book",
  cancellation_policy: "Cancellation policy",
  deposit: "Deposit",
  website_name: "Website address",
  website_template_pick: "Website template",
  review: "Final review",
};

export function describeStep(stepId: string | null | undefined): { label: string; phase: string | null } {
  if (!stepId) return { label: "Not started", phase: null };
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  return { label: STEP_LABELS[stepId] ?? stepId, phase: step?.phase ?? null };
}
