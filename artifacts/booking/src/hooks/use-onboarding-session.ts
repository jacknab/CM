/**
 * use-onboarding-session.ts — Onboarding state manager
 *
 * Holds all collected answers in React state, persists to localStorage on every
 * change so users resume exactly where they left off, and drives API submission.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ONBOARDING_STEPS,
  FIRST_STEP_ID,
  REQUIRED_STEP_IDS,
  getStepById,
  getStepIndex,
  type OnboardingAnswers,
  type TeamMemberDraft,
  type ServiceDraft,
  type DayHoursAnswer,
  slugify,
} from "@/lib/onboarding-script";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

// ── Session shape ─────────────────────────────────────────────────────────────

interface OnboardingSession {
  userId: string;
  version: 1;
  currentStepId: string;
  completedStepIds: string[];
  answers: Partial<OnboardingAnswers>;
  // Ephemeral team member being constructed (not yet in teamMembers[])
  currentMember: Partial<TeamMemberDraft> | null;
  savedAt: string;
  // Set once /api/onboarding succeeds — prevents duplicate store creation
  createdStoreId?: number;
}

function makeDefault(userId: string): OnboardingSession {
  return {
    userId,
    version: 1,
    currentStepId: FIRST_STEP_ID,
    completedStepIds: [],
    answers: {
      timezone: detectBrowserTimezone(),
      teamMembers: [],
      services: [],
    },
    currentMember: null,
    savedAt: new Date().toISOString(),
  };
}

function storageKey(userId: string) {
  return `certxa_ob_${userId}`;
}

function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const valid = [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Phoenix",
    ];
    if (valid.includes(tz)) return tz;
    if (tz.includes("New_York") || tz.includes("Detroit")) return "America/New_York";
    if (tz.includes("Chicago")) return "America/Chicago";
    if (tz.includes("Denver") || tz.includes("Boise")) return "America/Denver";
    if (tz.includes("Los_Angeles")) return "America/Los_Angeles";
    if (tz.includes("Anchorage")) return "America/Anchorage";
    if (tz.includes("Phoenix")) return "America/Phoenix";
    if (tz.includes("Honolulu")) return "Pacific/Honolulu";
  } catch { /* ignore */ }
  return "America/New_York";
}

// ── Progress calculation ──────────────────────────────────────────────────────

const TEAM_MEMBER_STEP_IDS = new Set([
  "team_member_name",
  "team_member_email",
  "team_member_role",
  "team_member_hours",
  "team_add_more",
]);

function calcProgress(
  completedIds: string[],
  answers: Partial<OnboardingAnswers>
): number {
  // Weight only data-entry steps. Exclude display-only AND the terminal review
  // step — review is submitted via submit(), not goNext(), so it is never added
  // to completedStepIds. Excluding it means the bar reaches 100% when all data
  // has been collected, which is the correct semantic for "done".
  const coreSteps = ONBOARDING_STEPS.filter(
    (s) => s.inputType !== "display_only" && s.inputType !== "review" && s.inputType !== "google_setup"
  );
  if (coreSteps.length === 0) return 0;

  const completedSet = new Set(completedIds);

  // ── Section-past sentinels ────────────────────────────────────────────────
  // "Past X" = at least one step that comes *after* section X has been
  // explicitly completed. This detects branch skips even when the user hit
  // the "Skip for now →" link and no answer key was written.

  // Past the name-entry gate (phone or later completed)
  const pastNameSection =
    completedSet.has("phone") ||
    completedSet.has("timezone") ||
    completedSet.has("hours") ||
    completedSet.has("services_intro") ||
    completedSet.has("services_method");

  // Past the hours step (services_intro or any later step completed)
  const pastHoursStep =
    completedSet.has("services_intro") ||
    completedSet.has("services_method") ||
    completedSet.has("team_intro") ||
    completedSet.has("slot_interval");

  // Past the services section (team_intro or slot_interval completed)
  const pastServicesSection =
    completedSet.has("team_intro") || completedSet.has("slot_interval");

  // Past the team section (slot_interval or any booking step completed)
  const pastTeamSection =
    completedSet.has("slot_interval") ||
    completedSet.has("buffer_time") ||
    completedSet.has("online_booking");

  // ── Answer signals (immediate, before navigation reaches the sentinel) ────
  // These allow the bar to advance the moment Google Places data arrives,
  // before the user has moved forward to the sentinel step.
  const googleConfirmedName = !!(answers.businessName && answers.placeId);
  const googleFoundHours = (answers.businessHours?.length ?? 0) > 0;

  // Services branch flags
  const tookUploadBranch = completedSet.has("services_upload");
  const tookManualBranch = completedSet.has("services_manual");
  const tookServicesBranch = tookUploadBranch || tookManualBranch;

  // Team skip flags (skip link does not write teamSize, so use both signals)
  const choseSoloOrSkip =
    answers.teamSize === "solo" || answers.teamSize === "skip";

  const done = coreSteps.filter((s) => {
    if (completedSet.has(s.id)) return true;

    switch (s.id) {
      // name_confirm: only shown on the Google-match path.
      // Not in completedIds + past name section → user went straight to salon_name
      // (no Google match), so name_confirm was legitimately bypassed.
      case "name_confirm":
        return pastNameSection;

      // salon_name: only shown when Google didn't find a match (or user denied it).
      // Not in completedIds + Google confirmed OR past name section → Google path
      // was taken and the manual-entry step was skipped.
      case "salon_name":
        return googleConfirmedName || pastNameSection;

      // hours: skipped when Google provided them, or when user used skip link.
      // Credit immediately via googleFoundHours so the bar advances right after
      // the user clicks "Yes, that's us!" and place-details arrive.
      case "hours":
        return googleFoundHours || pastHoursStep;

      // services_upload / services_manual: mutually exclusive alternatives.
      // Also both skipped when user chose "skip" option or hit the skip link
      // (in which case servicesMethod may be unset — detect via sentinel instead).
      case "services_upload":
        return tookManualBranch || (!tookServicesBranch && pastServicesSection);
      case "services_manual":
        return tookUploadBranch || (!tookServicesBranch && pastServicesSection);

      default:
        // Team-member detail steps are skipped when solo / skip chosen, or
        // when the user hit the team_intro skip link (teamSize stays unset).
        if (TEAM_MEMBER_STEP_IDS.has(s.id)) {
          return choseSoloOrSkip || pastTeamSection;
        }
        return false;
    }
  }).length;

  return Math.round((done / coreSteps.length) * 100);
}

// ── Default hours ─────────────────────────────────────────────────────────────

function defaultHours(): DayHoursAnswer[] {
  return [
    { dayOfWeek: 0, openTime: "09:00", closeTime: "18:00", isClosed: true  },
    { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "17:00", isClosed: false },
  ];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface OnboardingSessionHook {
  session: OnboardingSession;
  currentStep: ReturnType<typeof getStepById>;
  progressPct: number;
  chatHistory: ChatHistoryEntry[];
  setAnswer: (key: keyof OnboardingAnswers | string, value: unknown) => void;
  setAnswers: (updates: Partial<OnboardingAnswers>) => void;
  setCurrentMember: (updates: Partial<TeamMemberDraft> | null) => void;
  commitCurrentMember: () => void;
  goNext: (overrideNextId?: string) => void;
  goBack: () => void;
  goToStep: (id: string) => void;
  submit: () => Promise<void>;
  prepareGoogle: () => Promise<void>;
  reset: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  clearSubmitError: () => void;
}

export interface ChatHistoryEntry {
  id: string;
  stepId: string;
  type: "ai" | "user";
  content: string;
  timestamp: number;
}

export function useOnboardingSession(userId: string): OnboardingSessionHook {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const initialized = useRef(false);

  // ── Load from localStorage ────────────────────────────────────────────────

  const [session, setSessionRaw] = useState<OnboardingSession>(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as OnboardingSession;
        if (parsed.version === 1 && parsed.userId === userId) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return makeDefault(userId);
  });

  // ── Persist to localStorage on every change ───────────────────────────────

  const setSession = useCallback(
    (updater: OnboardingSession | ((prev: OnboardingSession) => OnboardingSession)) => {
      setSessionRaw((prev) => {
        const next =
          typeof updater === "function" ? updater(prev) : updater;
        const withTs = { ...next, savedAt: new Date().toISOString() };
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(withTs));
        } catch { /* storage full — ignore */ }
        return withTs;
      });
    },
    [userId]
  );

  // ── Build initial chat history on mount ───────────────────────────────────

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const history: ChatHistoryEntry[] = [];
    const { completedStepIds, answers, currentStepId } = session;

    // Replay completed steps as chat bubbles
    for (const stepId of completedStepIds) {
      const step = getStepById(stepId);
      if (!step) continue;

      const msg =
        typeof step.message === "function"
          ? step.message(answers)
          : step.message;

      history.push({
        id: `ai-${stepId}`,
        stepId,
        type: "ai",
        content: msg,
        timestamp: Date.now(),
      });

      const answerDisplay = getAnswerDisplay(stepId, answers);
      if (answerDisplay) {
        history.push({
          id: `user-${stepId}`,
          stepId,
          type: "user",
          content: answerDisplay,
          timestamp: Date.now(),
        });
      }
    }

    // Add current step AI message if not already shown
    const currentStep = getStepById(currentStepId);
    if (currentStep && !completedStepIds.includes(currentStepId)) {
      const msg =
        typeof currentStep.message === "function"
          ? currentStep.message(answers)
          : currentStep.message;
      history.push({
        id: `ai-${currentStepId}-current`,
        stepId: currentStepId,
        type: "ai",
        content: msg,
        timestamp: Date.now(),
      });
    }

    setChatHistory(history);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Answer setters ────────────────────────────────────────────────────────

  const setAnswer = useCallback(
    (key: keyof OnboardingAnswers | string, value: unknown) => {
      setSession((prev) => ({
        ...prev,
        answers: { ...prev.answers, [key]: value },
      }));
    },
    [setSession]
  );

  const setAnswers = useCallback(
    (updates: Partial<OnboardingAnswers>) => {
      setSession((prev) => ({
        ...prev,
        answers: { ...prev.answers, ...updates },
      }));
    },
    [setSession]
  );

  const setCurrentMember = useCallback(
    (updates: Partial<TeamMemberDraft> | null) => {
      if (updates === null) {
        setSession((prev) => ({ ...prev, currentMember: null }));
        return;
      }
      setSession((prev) => ({
        ...prev,
        currentMember: { ...(prev.currentMember ?? {}), ...updates },
      }));
    },
    [setSession]
  );

  const commitCurrentMember = useCallback(() => {
    setSession((prev) => {
      const m = prev.currentMember;
      if (!m?.firstName) return prev;
      const member: TeamMemberDraft = {
        id: `m-${Date.now()}`,
        firstName: m.firstName ?? "",
        lastName: m.lastName ?? "",
        email: m.email ?? "",
        role: m.role ?? "Other",
        workDays: m.workDays ?? [1, 2, 3, 4, 5],
        workStart: m.workStart ?? "09:00",
        workEnd: m.workEnd ?? "18:00",
      };
      return {
        ...prev,
        answers: {
          ...prev.answers,
          teamMembers: [...(prev.answers.teamMembers ?? []), member],
        },
        currentMember: null,
      };
    });
  }, [setSession]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const addAiBubble = useCallback(
    (stepId: string, answers: Partial<OnboardingAnswers>) => {
      const step = getStepById(stepId);
      if (!step) return;
      const msg =
        typeof step.message === "function"
          ? step.message({ ...answers, ...(session.currentMember ? { _currentMember: session.currentMember } : {}) })
          : step.message;
      setChatHistory((prev) => [
        ...prev,
        {
          id: `ai-${stepId}-${Date.now()}`,
          stepId,
          type: "ai",
          content: msg,
          timestamp: Date.now(),
        },
      ]);
    },
    [session.currentMember]
  );

  const addUserBubble = useCallback(
    (stepId: string, answers: Partial<OnboardingAnswers>) => {
      const display = getAnswerDisplay(stepId, answers);
      if (!display) return;
      setChatHistory((prev) => [
        ...prev,
        {
          id: `user-${stepId}-${Date.now()}`,
          stepId,
          type: "user",
          content: display,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  const goToStep = useCallback(
    (id: string) => {
      const step = getStepById(id);
      if (!step) return;
      setSession((prev) => ({ ...prev, currentStepId: id }));
      addAiBubble(id, session.answers);
    },
    [setSession, addAiBubble, session.answers]
  );

  const goNext = useCallback(
    (overrideNextId?: string) => {
      setSession((prev) => {
        const currentStep = getStepById(prev.currentStepId);
        if (!currentStep) return prev;

        // Mark current as completed
        const completedStepIds = prev.completedStepIds.includes(prev.currentStepId)
          ? prev.completedStepIds
          : [...prev.completedStepIds, prev.currentStepId];

        // Determine next step ID
        let nextId: string | undefined = overrideNextId;
        if (!nextId) {
          if (typeof currentStep.nextStep === "function") {
            nextId = currentStep.nextStep(prev.answers);
          } else if (currentStep.nextStep) {
            nextId = currentStep.nextStep;
          } else {
            // Fall to next in array
            const idx = getStepIndex(prev.currentStepId);
            nextId = idx >= 0 ? ONBOARDING_STEPS[idx + 1]?.id : undefined;
          }
        }

        // Auto-skip the timezone confirmation step when timezone was already
        // derived from the user's state (zip_lookup). Mark it completed so
        // progress calculation credits it correctly.
        if (nextId === "timezone" && prev.answers.timezoneAutoConfirmed) {
          const timezoneStep = getStepById("timezone");
          if (!completedStepIds.includes("timezone")) completedStepIds.push("timezone");
          if (timezoneStep) {
            if (typeof timezoneStep.nextStep === "function") {
              nextId = timezoneStep.nextStep(prev.answers);
            } else if (timezoneStep.nextStep) {
              nextId = timezoneStep.nextStep as string;
            }
          }
        }

        const next = nextId ? getStepById(nextId) : undefined;

        // Add user answer bubble for current step
        addUserBubble(prev.currentStepId, prev.answers);

        if (!next) return { ...prev, completedStepIds };

        // Add AI bubble for next step
        setTimeout(() => addAiBubble(next.id, prev.answers), 400);

        return {
          ...prev,
          completedStepIds,
          currentStepId: next.id,
        };
      });
    },
    [setSession, addUserBubble, addAiBubble]
  );

  const goBack = useCallback(() => {
    setSession((prev) => {
      const completed = [...prev.completedStepIds];
      const lastId = completed.pop();
      if (!lastId) return prev;
      return {
        ...prev,
        completedStepIds: completed,
        currentStepId: lastId,
      };
    });
  }, [setSession]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    const fresh = makeDefault(userId);
    setSession(fresh);
    setChatHistory([]);
    initialized.current = false;

    // Re-add first AI message
    const firstStep = getStepById(FIRST_STEP_ID);
    if (firstStep) {
      const msg =
        typeof firstStep.message === "function"
          ? firstStep.message({})
          : firstStep.message;
      setChatHistory([
        {
          id: `ai-${FIRST_STEP_ID}-init`,
          stepId: FIRST_STEP_ID,
          type: "ai",
          content: msg,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [userId, setSession]);

  // ── Submission ────────────────────────────────────────────────────────────

  const prepareGoogle = useCallback(async () => {
    if (session.createdStoreId) return;
    const a = session.answers;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const hours = (a.businessHours ?? defaultHours()).map((h) => ({
        dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed,
      }));
      const res = await apiRequest("POST", "/api/onboarding", {
        businessType: a.businessType ?? "Other",
        businessName: a.businessName ?? "",
        phone: (a.phone ?? "").replace(/\D/g, ""),
        address: a.address ?? "", city: a.city ?? "", state: a.state ?? "", postcode: a.postcode ?? "",
        timezone: a.timezone ?? "America/New_York",
        businessHours: hours,
        bookingSlug: a.bookingSlug ?? slugify(a.businessName ?? "my-salon"),
        website: a.website ?? undefined, latitude: a.latitude ?? undefined, longitude: a.longitude ?? undefined,
      });
      const data = await res.json();
      const storeId: number = data.storeId ?? data.store?.id ?? data.id;
      if (!storeId) throw new Error("Your salon was saved, but Google setup could not start.");
      setSession((prev) => ({ ...prev, createdStoreId: storeId }));
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Google setup could not start. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [session.answers, session.createdStoreId, queryClient, setSession]);

  const submit = useCallback(async () => {
    const a = session.answers;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Create store
      const hours = (a.businessHours ?? defaultHours()).map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      }));

      const slug = a.bookingSlug ?? slugify(a.businessName ?? "my-salon");

      const onboardingPayload = {
        businessType: a.businessType ?? "Other",
        businessName: a.businessName ?? "",
        phone: (a.phone ?? "").replace(/\D/g, ""),
        address: a.address ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
        postcode: a.postcode ?? "",
        timezone: a.timezone ?? "America/New_York",
        businessHours: hours,
        bookingSlug: slug,
        website:   (a as any).website   ?? undefined,
        latitude:  (a as any).latitude  ?? undefined,
        longitude: (a as any).longitude ?? undefined,
        staff: (a.teamMembers ?? []).map((m) => ({
          name: `${m.firstName} ${m.lastName}`.trim(),
          color: randomColor(),
        })),
      };

      const res = await apiRequest("POST", "/api/onboarding", onboardingPayload);
      const data = await res.json();
      const storeId: number = data.storeId ?? data.store?.id ?? data.id;

      // Save storeId to prevent duplicate submission
      setSession((prev) => ({ ...prev, createdStoreId: storeId }));

      // 2. Create staff members individually
      for (const member of a.teamMembers ?? []) {
        try {
          const staffRes = await apiRequest("POST", "/api/staff", {
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email || undefined,
            role: member.role,
            storeId,
          });
          const staffData = await staffRes.json();
          const staffId = staffData.id ?? staffData.staff?.id;

          if (staffId && member.workDays.length > 0) {
            await apiRequest(`PUT`, `/api/staff/${staffId}/availability`, {
              availability: member.workDays.map((day) => ({
                dayOfWeek: day,
                startTime: member.workStart,
                endTime: member.workEnd,
              })),
            });
          }
        } catch {
          // Non-fatal: staff can be added later
        }
      }

      // 3. Save calendar settings
      if (
        a.slotInterval !== undefined ||
        a.bufferTime !== undefined ||
        a.onlineBooking !== undefined
      ) {
        try {
          await apiRequest("POST", "/api/calendar-settings", {
            slotInterval: a.slotInterval ?? 30,
            bufferTime: a.bufferTime ?? 0,
            allowOnlineBooking: a.onlineBooking ?? true,
            maxAdvanceDays: a.maxAdvanceDays ?? 30,
          });
        } catch {
          // Non-fatal
        }
      }

      // 4. Mark setup flows complete
      const flowUpdates: Array<[string, string]> = [
        ["business_setup", "complete"],
      ];
      if ((a.teamMembers ?? []).length > 0)
        flowUpdates.push(["team_members", "complete"]);
      if (a.slotInterval !== undefined)
        flowUpdates.push(["booking_calendar", "complete"]);

      await Promise.allSettled(
        flowUpdates.map(([key, status]) =>
          apiRequest("PATCH", `/api/setup/progress/${key}`, { status })
        )
      );

      // 5. Launch free website if the user chose a website name during onboarding
      const websiteName = (a as any).websiteName as string | undefined;
      const websiteTemplateId = (a as any).websiteTemplateId as string | undefined;
      if (websiteName) {
        try {
          await apiRequest("POST", "/api/setup/website-launch", {
            slug: slugify(websiteName),
            templatePreference: websiteTemplateId ?? "bloom",
          });
        } catch {
          // Non-fatal: user can set up website from dashboard
        }
      }

      // 6. Complete onboarding after the Google phase and remaining setup.
      localStorage.removeItem(storageKey(userId));
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [session, navigate, queryClient, setSession, userId]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentStep = getStepById(session.currentStepId);
  const progressPct = calcProgress(session.completedStepIds, session.answers);

  return {
    session,
    currentStep,
    progressPct,
    chatHistory,
    setAnswer,
    setAnswers,
    setCurrentMember,
    commitCurrentMember,
    goNext,
    goBack,
    goToStep,
    submit,
    prepareGoogle,
    reset,
    isSubmitting,
    submitError,
    clearSubmitError: () => setSubmitError(null),
  };
}

// ── Answer → display string ───────────────────────────────────────────────────

function getAnswerDisplay(
  stepId: string,
  answers: Partial<OnboardingAnswers>
): string | null {
  switch (stepId) {
    case "business_type":
      return answers.businessType ?? null;
    case "salon_name":
      return answers.businessName ?? null;
    case "address":
      return answers.address || "Skipped";
    case "name_confirm":
      return answers.businessName ?? null;
    case "zip_lookup":
      return [answers.postcode, answers.city, answers.state].filter(Boolean).join(" · ") || null;
    case "phone":
      return formatPhoneDisplay(answers.phone ?? "") || "Skipped";
    case "timezone": {
      const tz = answers.timezone ?? "";
      const map: Record<string, string> = {
        "America/New_York": "Eastern (ET)",
        "America/Chicago": "Central (CT)",
        "America/Denver": "Mountain (MT)",
        "America/Los_Angeles": "Pacific (PT)",
        "America/Anchorage": "Alaska (AKT)",
        "Pacific/Honolulu": "Hawaii (HT)",
        "America/Phoenix": "Arizona (MST)",
      };
      return map[tz] ?? tz;
    }
    case "hours":
      return answers.businessHours
        ? answers.businessHours.filter((d) => !d.isClosed).length + " days set"
        : "Skipped";
    case "website_name":
      return (answers as any).websiteName ? `${(answers as any).websiteName}.certxa.com` : null;
    case "website_template_pick": {
      const tid = (answers as any).websiteTemplateId;
      if (tid === "bloom") return "Bloom — Elegant & Modern";
      if (tid === "aria")  return "Aria — Clean & Minimal";
      return tid ?? null;
    }
    case "services_method": {
      const m = answers.servicesMethod;
      if (m === "upload") return "Menu upload";
      if (m === "manual") return "Adding manually";
      return "Skip for now";
    }
    case "team_intro": {
      const t = answers.teamSize;
      if (t === "team") return "I have a team";
      if (t === "solo") return "Just me";
      return "Skip for now";
    }
    case "slot_interval":
      return answers.slotInterval ? `${answers.slotInterval} min slots` : null;
    case "buffer_time":
      return answers.bufferTime != null
        ? answers.bufferTime === 0
          ? "No buffer"
          : `${answers.bufferTime} min buffer`
        : null;
    case "online_booking":
      return answers.onlineBooking ? "Online booking: Yes" : "Online booking: No";
    case "advance_window":
      return answers.maxAdvanceDays ? `${answers.maxAdvanceDays} days advance` : null;
    case "cancellation_policy":
      return answers.cancellationPolicy ?? null;
    case "deposit":
      return answers.depositRequired
        ? `Deposit: ${answers.depositPct ?? 20}%`
        : "No deposit";
    default:
      return null;
  }
}

function formatPhoneDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const COLORS = ["#7C3AED","#2563EB","#16A34A","#D97706","#DC2626","#DB2777","#0891B2"];
function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
