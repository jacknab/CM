/**
 * A ready kiosk for each business type (plans/kiosk-builder.md). A business that never opens the kiosk
 * builder gets its type's preset; the builder starts from one.
 *
 * Nail and hair salons get exactly the kiosk they had before the builder existed. The other types differ
 * only in what the staff are called and which steps they start with.
 */

import { businessTypeOf, type BusinessTypeKey } from "./businessTypes";
import { KIOSK_DEFAULTS, normalizeKioskLayout, type KioskLayout, type KioskStepId } from "./layout";
import type { KioskLang, KioskText } from "./text";

/** What the staff are called, in each kiosk language. */
type Noun = Record<KioskLang, string>;

/** Korean object particle for a noun: 을 after a final consonant, else 를. */
function koObject(n: string): string {
  const last = n.charCodeAt(n.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return n + (hangul && (last - 0xac00) % 28 !== 0 ? "을" : "를");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The staff sentences for one noun, in every language. */
function staffWords(n: Noun): Record<string, KioskText> {
  return {
    whoWouldYouLike: {
      en: "Who would you like today?",
      es: "¿Quién prefieres hoy?",
      vi: `Bạn muốn chọn ${n.vi} nào?`,
      zh: `您希望哪位${n.zh}为您服务？`,
      ko: `어떤 ${koObject(n.ko)} 원하시나요?`,
    },
    pickStylist: {
      en: `Pick your preferred ${n.en} or go with next available`,
      es: `Elige tu ${n.es} preferido o el primero disponible`,
      vi: `Chọn ${n.vi} yêu thích hoặc người có sẵn tiếp theo`,
      zh: `请选择您偏好的${n.zh}，或选择下一位空闲${n.zh}`,
      ko: `선호하는 ${koObject(n.ko)} 선택하거나 다음 가용 ${koObject(n.ko)} 선택하세요`,
    },
    showQr: {
      en: `Show this screen or QR code to your ${n.en}`,
      es: `Muestra esta pantalla o el código QR a tu ${n.es}`,
      vi: `Cho ${n.vi} xem màn hình hoặc mã QR này`,
      zh: `请将此屏幕或二维码出示给${n.zh}`,
      ko: `이 화면 또는 QR 코드를 ${n.ko}에게 보여주세요`,
    },
    yourStylist: {
      en: `Your ${n.en}`,
      es: `Tu ${n.es}`,
      vi: cap(n.vi),
      zh: `您的${n.zh}`,
      ko: `담당 ${n.ko}`,
    },
  };
}

const NOUNS: Partial<Record<BusinessTypeKey, Noun>> = {
  barber: { en: "barber", es: "barbero", vi: "thợ cắt tóc", zh: "理发师", ko: "이발사" },
  spa: { en: "therapist", es: "terapeuta", vi: "chuyên viên trị liệu", zh: "理疗师", ko: "테라피스트" },
  esthetics: { en: "esthetician", es: "esteticista", vi: "chuyên viên thẩm mỹ", zh: "美容师", ko: "에스테티션" },
  pet: { en: "groomer", es: "peluquero de mascotas", vi: "thợ chăm sóc thú cưng", zh: "宠物美容师", ko: "미용사" },
  tattoo: { en: "artist", es: "artista", vi: "thợ xăm", zh: "纹身师", ko: "타투이스트" },
  other: { en: "team member", es: "profesional", vi: "nhân viên", zh: "服务人员", ko: "직원" },
};

/** The kiosk sentences that name the staff (Kiosk Builder › Words › "What clients call your staff"). */
export const STAFF_TEXT_KEYS = ["whoWouldYouLike", "pickStylist", "showQr", "yourStylist"] as const;

/** The choices for what clients call the staff. "stylist" is the kiosk's own wording (no text of the business's). */
export const STAFF_TITLES: Array<{ key: string; label: string; noun: Noun | null }> = [
  { key: "stylist", label: "Stylist (the kiosk's own words)", noun: null },
  { key: "nailtech", label: "Nail technician", noun: { en: "nail technician", es: "técnico de uñas", vi: "kỹ thuật viên", zh: "美甲师", ko: "네일 아티스트" } },
  { key: "barber", label: "Barber", noun: NOUNS.barber! },
  { key: "therapist", label: "Therapist", noun: NOUNS.spa! },
  { key: "esthetician", label: "Esthetician", noun: NOUNS.esthetics! },
  { key: "groomer", label: "Groomer", noun: NOUNS.pet! },
  { key: "artist", label: "Artist", noun: NOUNS.tattoo! },
  { key: "team", label: "Team member", noun: NOUNS.other! },
];

/** The staff sentences for a choice in every language ({} for the kiosk's own words). */
export function staffTextFor(key: string): Record<string, KioskText> {
  const t = STAFF_TITLES.find((x) => x.key === key);
  return t?.noun ? staffWords(t.noun) : {};
}

/** Which choice a layout's words match: a STAFF_TITLES key, or "custom" when the business wrote its own. */
export function currentStaffTitle(text: Record<string, KioskText>): string {
  if (STAFF_TEXT_KEYS.every((k) => !text[k])) return "stylist";
  for (const t of STAFF_TITLES) {
    if (!t.noun) continue;
    const want = staffWords(t.noun);
    if (STAFF_TEXT_KEYS.every((k) => JSON.stringify(text[k] ?? null) === JSON.stringify(want[k]))) return t.key;
  }
  return "custom";
}

export interface KioskPreset {
  key: BusinessTypeKey;
  /** For the builder's preset list. */
  name: string;
  description: string;
  layout: KioskLayout;
}

function preset(key: BusinessTypeKey, name: string, description: string, opts: {
  look?: KioskLayout["theme"]["look"];
  off?: KioskStepId[];
}): KioskPreset {
  const noun = NOUNS[key];
  const layout = normalizeKioskLayout({
    ...KIOSK_DEFAULTS,
    preset: key,
    theme: { look: opts.look ?? "classic", colors: {} },
    steps: KIOSK_DEFAULTS.steps.map((s) => ({ id: s.id, enabled: !opts.off?.includes(s.id) })),
    text: noun ? staffWords(noun) : {},
  }, key);
  return { key, name, description, layout };
}

export const KIOSK_PRESETS: Record<BusinessTypeKey, KioskPreset> = {
  nail: preset("nail", "Nail salon", "Cream and copper look; nail length, shape and design questions.", { look: "boutique" }),
  hair: preset("hair", "Hair salon", "Categories, services, add-ons and stylist choice.", { off: ["questions"] }),
  barber: preset("barber", "Barbershop", "Services, add-ons and barber choice.", { off: ["questions"] }),
  spa: preset("spa", "Spa", "Categories, services, add-ons and therapist choice.", { off: ["questions"] }),
  esthetics: preset("esthetics", "Esthetics", "Categories, services, add-ons and esthetician choice.", { off: ["questions"] }),
  pet: preset("pet", "Pet grooming", "Categories, services, add-ons and groomer choice.", { off: ["questions"] }),
  tattoo: preset("tattoo", "Tattoo studio", "Categories, services and artist choice.", { off: ["questions", "addons"] }),
  other: preset("other", "Any business", "Categories, services, add-ons and team member choice.", { off: ["questions"] }),
};

/** A fresh copy of a preset's layout (callers may change it). */
export function presetLayout(key: BusinessTypeKey): KioskLayout {
  return structuredClone(KIOSK_PRESETS[key].layout);
}

/**
 * The layout a store gets when it has none saved: its business type's preset, carrying the kiosk settings
 * it already had (Settings › Check-in Kiosk) so nothing changes for it.
 */
export function defaultKioskLayout(category: string | null | undefined, legacy: {
  showServicePrice?: unknown; showServiceDuration?: unknown; smartCheckin?: unknown;
} = {}): KioskLayout {
  const layout = presetLayout(businessTypeOf(category).key);
  layout.services.showPrice = legacy.showServicePrice !== false;
  layout.services.showDuration = legacy.showServiceDuration !== false;
  layout.smartCheckin = legacy.smartCheckin !== false;
  return layout;
}
