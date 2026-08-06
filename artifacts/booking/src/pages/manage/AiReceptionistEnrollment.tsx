import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/use-language";
import {
  ArrowLeft,
  ArrowRight,
  Phone,
  PhoneCall,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  AlertTriangle,
  ToggleRight,
  Wallet,
  Clock,
  RefreshCw,
  Plus,
  DollarSign,
  Sparkles,
  CalendarCheck,
  UserCheck,
  Moon,
} from "lucide-react";

interface ReceptionistSettings {
  enabled: boolean;
  apiKeyConfigured: boolean;
  phoneProvisioned: boolean;
  provisionedPhoneNumber: string | null;
  businessAreaCode: string | null;
}

interface AccountBalance {
  balance: string;
  hasSufficientFunds: boolean;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
}

type Step = "intro" | "pick";

function formatPhone(e164: string | null): string {
  if (!e164) return "—";
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

async function fetchSettings(): Promise<ReceptionistSettings> {
  const res = await fetch("/api/ai-receptionist/settings", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load AI Receptionist settings");
  return res.json();
}

async function fetchAccountBalance(): Promise<AccountBalance> {
  const res = await fetch("/api/ai-receptionist/account-balance", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load account balance");
  return res.json();
}

async function fetchAvailableNumbers(areaCode: string): Promise<{ numbers: AvailableNumber[] }> {
  const res = await fetch(`/api/ai-receptionist/available-numbers?areaCode=${areaCode}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Failed to fetch available numbers");
  }
  return res.json();
}

async function provisionNumber(phoneNumber: string): Promise<{ success: boolean; enabled: boolean; balanceAfter: string }> {
  const res = await fetch("/api/ai-receptionist/provision-number", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Failed to provision phone number");
  }
  return res.json();
}

async function toggleEnabled(enabled: boolean): Promise<void> {
  const res = await fetch("/api/ai-receptionist/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Failed to update settings");
  }
}

function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ["intro", "pick"];
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`rounded-full transition-all ${
            i === idx
              ? "w-6 h-2 bg-amber-500"
              : i < idx
              ? "w-2 h-2 bg-amber-300"
              : "w-2 h-2 bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function IntroStep({ onContinue }: { onContinue: () => void }) {
  const { pick } = useLanguage();

  const t = {
    heading:    pick({ en: "Meet Autumn, your AI Receptionist",                                vi: "Gặp Autumn, lễ tân AI của bạn",                  es: "Conoce a Autumn, tu recepcionista IA",           fr: "Rencontrez Autumn, votre réceptionniste IA" }),
    subheading: pick({ en: "Autumn answers every call, books appointments in real time, and handles cancellations — all without lifting a finger. Available 24/7, even when you're with a client.", vi: "Autumn trả lời mọi cuộc gọi, đặt lịch theo thời gian thực và xử lý hủy lịch — tất cả mà không cần can thiệp.", es: "Autumn responde cada llamada, reserva citas en tiempo real y gestiona cancelaciones.", fr: "Autumn répond à chaque appel, réserve des rendez-vous en temps réel." }),
    alwaysOn:   pick({ en: "Always on",      vi: "Luôn hoạt động", es: "Siempre activa",   fr: "Toujours active" }),
    response:   pick({ en: "Response time",  vi: "Thời gian phản hồi", es: "Tiempo de respuesta", fr: "Temps de réponse" }),
    answered:   pick({ en: "Calls answered", vi: "Cuộc gọi được trả lời", es: "Llamadas atendidas", fr: "Appels répondus" }),
    pricing:    pick({ en: "Pricing",        vi: "Bảng giá",       es: "Precios",          fr: "Tarifs" }),
    activationFee:    pick({ en: "One-Time Activation Fee",    vi: "Phí kích hoạt một lần",  es: "Tarifa de activación única",      fr: "Frais d'activation uniques" }),
    activationDesc:   pick({ en: "Covers setup & activation of your dedicated phone number, plus provisioning of the Autumn system.", vi: "Bao gồm cài đặt & kích hoạt số điện thoại và cấp phép hệ thống Autumn.", es: "Cubre la configuración y activación de tu número y el aprovisionamiento del sistema Autumn.", fr: "Couvre la configuration et l'activation de votre numéro et le provisionnement du système Autumn." }),
    monthlyFee:       pick({ en: "Monthly Phone Lease",        vi: "Thuê số điện thoại hàng tháng", es: "Arrendamiento mensual del número", fr: "Location mensuelle du numéro" }),
    monthlyDesc:      pick({ en: "Your dedicated local phone number, leased and maintained.", vi: "Số điện thoại địa phương riêng của bạn.", es: "Tu número local dedicado, arrendado y mantenido.", fr: "Votre numéro local dédié, loué et maintenu." }),
    perMinFee:        pick({ en: "Per Minute (calls over 30s)", vi: "Mỗi phút (cuộc gọi trên 30 giây)", es: "Por minuto (llamadas >30s)",     fr: "Par minute (appels >30s)" }),
    perMinDesc:       pick({ en: "Calls under 30 seconds are completely free. After that, billing is per second at $0.0041/sec.", vi: "Cuộc gọi dưới 30 giây miễn phí. Sau đó, $0,0041/giây.", es: "Llamadas de menos de 30 segundos son gratis. Luego, $0.0041/seg.", fr: "Les appels de moins de 30 secondes sont gratuits. Ensuite, 0,0041 $/sec." }),
    freeBadge:        pick({ en: "First 30 sec free",          vi: "30 giây đầu miễn phí", es: "Primeros 30 seg gratis",            fr: "30 premières sec gratuites" }),
    f1Title:    pick({ en: "Books new appointments",      vi: "Đặt lịch mới",        es: "Reserva nuevas citas",          fr: "Réserve de nouveaux rendez-vous" }),
    f1Desc:     pick({ en: "Checks real-time availability and confirms bookings instantly", vi: "Kiểm tra khả dụng theo thời gian thực", es: "Verifica disponibilidad en tiempo real", fr: "Vérifie la disponibilité en temps réel" }),
    f2Title:    pick({ en: "Reschedules & cancels",       vi: "Lên lịch lại & hủy",  es: "Reprograma y cancela",          fr: "Replanifie et annule" }),
    f2Desc:     pick({ en: "Handles change requests without involving your staff", vi: "Xử lý yêu cầu thay đổi mà không cần nhân viên", es: "Gestiona cambios sin involucrar a tu personal", fr: "Gère les modifications sans impliquer votre personnel" }),
    f3Title:    pick({ en: "Remembers returning clients", vi: "Nhớ khách quay lại",  es: "Recuerda clientes recurrentes", fr: "Mémorise les clients fidèles" }),
    f3Desc:     pick({ en: "Greets regulars by name and recalls their last service", vi: "Chào đón khách quen bằng tên", es: "Saluda a los habituales por nombre", fr: "Accueille les habitués par leur nom" }),
    f4Title:    pick({ en: "Available 24/7",              vi: "Hoạt động 24/7",      es: "Disponible 24/7",               fr: "Disponible 24h/24" }),
    f4Desc:     pick({ en: "Never misses a call — even outside business hours", vi: "Không bao giờ bỏ lỡ cuộc gọi", es: "Nunca pierde una llamada", fr: "Ne rate jamais un appel" }),
    getStarted: pick({ en: "Choose Your Number",          vi: "Chọn số của bạn",     es: "Elegir tu número",              fr: "Choisir votre numéro" }),
  };

  const features = [
    { icon: CalendarCheck, title: t.f1Title, desc: t.f1Desc },
    { icon: Sparkles,      title: t.f2Title, desc: t.f2Desc },
    { icon: UserCheck,     title: t.f3Title, desc: t.f3Desc },
    { icon: Moon,          title: t.f4Title, desc: t.f4Desc },
  ];

  const pricing = [
    {
      amount: "$15",
      period: pick({ en: "one-time", vi: "một lần", es: "único", fr: "unique" }),
      label: t.activationFee,
      desc: t.activationDesc,
      highlight: true,
    },
    {
      amount: "$2",
      period: pick({ en: "/ month", vi: "/ tháng", es: "/ mes", fr: "/ mois" }),
      label: t.monthlyFee,
      desc: t.monthlyDesc,
      highlight: false,
    },
    {
      amount: "$0.25",
      period: pick({ en: "/ min", vi: "/ phút", es: "/ min", fr: "/ min" }),
      label: t.perMinFee,
      desc: t.perMinDesc,
      badge: t.freeBadge,
      highlight: false,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <StepDots current="intro" />

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-200">
          <PhoneCall className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-3">{t.heading}</h1>
        <p className="text-slate-500 text-base leading-relaxed max-w-lg mx-auto">{t.subheading}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { value: "24/7", label: t.alwaysOn },
          { value: "<1s",  label: t.response },
          { value: "100%", label: t.answered },
        ].map(({ value, label }) => (
          <div key={label} className="bg-amber-50 rounded-2xl p-4 text-center border border-amber-100">
            <p className="text-2xl font-bold text-amber-600">{value}</p>
            <p className="text-xs text-slate-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-3 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-amber-500" size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.pricing}</p>
        </div>
        <div className="space-y-3">
          {pricing.map(({ amount, period, label, desc, badge, highlight }) => (
            <div
              key={label}
              className={`rounded-2xl border p-4 flex items-start gap-4 ${
                highlight
                  ? "bg-slate-800 border-slate-700 text-white"
                  : "bg-white border-slate-100 shadow-sm"
              }`}
            >
              <div className="shrink-0 text-right min-w-[72px]">
                <span className={`text-2xl font-bold ${highlight ? "text-amber-400" : "text-slate-800"}`}>
                  {amount}
                </span>
                <span className={`text-xs ml-1 ${highlight ? "text-slate-400" : "text-slate-400"}`}>
                  {period}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-semibold ${highlight ? "text-white" : "text-slate-700"}`}>
                    {label}
                  </p>
                  {badge && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                      {badge}
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 leading-relaxed ${highlight ? "text-slate-400" : "text-slate-400"}`}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-base rounded-2xl transition-colors shadow-md shadow-amber-200"
      >
        {t.getStarted}
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function PhonePickStep({
  settings,
  onBack,
  onProvisioned,
}: {
  settings: ReceptionistSettings | undefined;
  onBack: () => void;
  onProvisioned: () => void;
}) {
  const qc = useQueryClient();
  const { pick } = useLanguage();
  const [areaCode, setAreaCode] = useState("");
  const [searchedAreaCode, setSearchedAreaCode] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance, isFetching: balanceFetching } =
    useQuery<AccountBalance>({
      queryKey: ["/api/ai-receptionist/account-balance"],
      queryFn: fetchAccountBalance,
      staleTime: 10_000,
    });

  const t = {
    back:          pick({ en: "Back",                                   vi: "Quay lại",               es: "Atrás",                        fr: "Retour" }),
    title:         pick({ en: "Choose Your Number",                     vi: "Chọn số của bạn",        es: "Elige tu número",               fr: "Choisissez votre numéro" }),
    subtitle:      pick({ en: "Search by area code to find available local numbers.",                  vi: "Tìm kiếm theo mã vùng để tìm số địa phương.", es: "Busca por código de área.", fr: "Recherchez par indicatif régional." }),
    currentNumber: pick({ en: "Current Number",                         vi: "Số hiện tại",            es: "Número actual",                 fr: "Numéro actuel" }),
    replaceNote:   pick({ en: "Selecting a new number will replace this one.",                         vi: "Chọn số mới sẽ thay thế số này.", es: "Un nuevo número reemplazará a este.", fr: "Un nouveau numéro remplacera celui-ci." }),
    areaCodePh:    pick({ en: "Area code (e.g. 305)",                   vi: "Mã vùng",                es: "Código de área",                fr: "Indicatif régional" }),
    searchBtn:     pick({ en: "Search",                                 vi: "Tìm kiếm",               es: "Buscar",                        fr: "Rechercher" }),
    invalidCode:   pick({ en: "Enter a 3-digit US area code",           vi: "Nhập mã vùng Mỹ 3 chữ số", es: "Ingresa un código de 3 dígitos", fr: "Entrez un indicatif à 3 chiffres" }),
    noNumbers:     pick({ en: "No numbers available in area code",      vi: "Không có số trong mã vùng", es: "Sin números en el código de área", fr: "Aucun numéro pour l'indicatif" }),
    tryNearby:     pick({ en: "Try a nearby code.",                     vi: "Thử mã gần đó.",         es: "Prueba un código cercano.",      fr: "Essayez un indicatif voisin." }),
    available:     pick({ en: "numbers available in",                   vi: "số có trong",            es: "números disponibles en",        fr: "numéros disponibles pour" }),
    clickToSelect: pick({ en: "— click one to select",                  vi: "— nhấp để chọn",         es: "— haz clic para seleccionar",   fr: "— cliquez pour sélectionner" }),
    selected:      pick({ en: "Selected:",                              vi: "Đã chọn:",               es: "Seleccionado:",                 fr: "Sélectionné :" }),
    activating:    pick({ en: "Activating…",                            vi: "Đang kích hoạt…",        es: "Activando…",                    fr: "Activation…" }),
    activate:      pick({ en: "Activate Autumn — $15",                  vi: "Kích hoạt Autumn — $15", es: "Activar Autumn — $15",          fr: "Activer Autumn — 15 $" }),
    searchHint:    pick({ en: "Enter your area code above to see available numbers", vi: "Nhập mã vùng để xem số có sẵn", es: "Ingresa tu código de área para ver números", fr: "Entrez votre indicatif pour voir les numéros disponibles" }),
    balanceLabel:  pick({ en: "Account Balance",                        vi: "Số dư tài khoản",        es: "Saldo de cuenta",               fr: "Solde du compte" }),
    insufficientFunds: pick({ en: "Insufficient balance. You need at least $15.00 to activate.", vi: "Số dư không đủ. Cần ít nhất $15,00.", es: "Saldo insuficiente. Necesitas al menos $15.00.", fr: "Solde insuffisant. Vous avez besoin d'au moins 15,00 $." }),
    addFunds:      pick({ en: "Add Funds",                              vi: "Nạp tiền",               es: "Añadir fondos",                 fr: "Ajouter des fonds" }),
    activationNote: pick({ en: "$15 activation fee will be charged on confirmation.",              vi: "Phí kích hoạt $15 sẽ được tính khi xác nhận.", es: "Se cobrarán $15 al confirmar.", fr: "Des frais d'activation de 15 $ seront facturés à la confirmation." }),
  };

  useEffect(() => {
    if (settings?.businessAreaCode && !areaCode) {
      setAreaCode(settings.businessAreaCode);
    }
  }, [settings?.businessAreaCode]);

  const provisionMutation = useMutation({
    mutationFn: provisionNumber,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai-receptionist/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-receptionist/account-balance"] });
      onProvisioned();
    },
    onError: (err: Error) => {
      setProvisionError(err.message);
    },
  });

  const handleSearch = async () => {
    const code = areaCode.replace(/\D/g, "").slice(0, 3);
    if (code.length !== 3) { setSearchError(t.invalidCode); return; }
    setSearchError(null);
    setAvailableNumbers(null);
    setSelectedNumber(null);
    setSearching(true);
    try {
      const result = await fetchAvailableNumbers(code);
      setAvailableNumbers(result.numbers);
      setSearchedAreaCode(code);
      if (result.numbers.length === 0) {
        setSearchError(`${t.noNumbers} ${code}. ${t.tryNearby}`);
      }
    } catch (err: any) {
      setSearchError(err.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const bal = parseFloat(balance?.balance ?? "0");
  const sufficient = bal >= 15;

  return (
    <div className="max-w-2xl mx-auto">
      <StepDots current="pick" />

      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Phone className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.title}</h2>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
      </div>

      {/* Current number (if replacing) */}
      {settings?.phoneProvisioned && settings?.provisionedPhoneNumber && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{t.currentNumber}</p>
          <p className="text-xl font-bold text-slate-800">{formatPhone(settings.provisionedPhoneNumber)}</p>
          <p className="text-xs text-slate-400 mt-1">{t.replaceNote}</p>
        </div>
      )}

      {/* Balance chip */}
      {!balanceLoading && (
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-5 border ${sufficient ? "bg-emerald-50 border-emerald-100" : "bg-orange-50 border-orange-100"}`}>
          <div className="flex items-center gap-2">
            <Wallet className={`w-4 h-4 ${sufficient ? "text-emerald-500" : "text-orange-500"}`} />
            <span className="text-sm font-medium text-slate-700">{t.balanceLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${sufficient ? "text-emerald-600" : "text-orange-600"}`}>
              ${bal.toFixed(2)}
            </span>
            <button onClick={() => refetchBalance()} disabled={balanceFetching} className="text-slate-400 hover:text-slate-600 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${balanceFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {!sufficient && !balanceLoading && (
        <div className="flex items-center justify-between gap-4 bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-2 text-orange-700 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t.insufficientFunds}</span>
          </div>
          <Link
            to="/manage/credits"
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.addFunds}
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1 max-w-[200px]">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder={t.areaCodePh}
              value={areaCode}
              onChange={(e) => {
                setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3));
                setSearchError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || areaCode.length !== 3}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t.searchBtn}
          </button>
        </div>

        {searchError && (
          <div className="flex items-center gap-2 text-sm text-orange-600 mb-4">
            <XCircle className="w-4 h-4 shrink-0" />
            {searchError}
          </div>
        )}

        {availableNumbers && availableNumbers.length > 0 && (
          <>
            <p className="text-xs text-slate-400 mb-3">
              {availableNumbers.length} {t.available} ({searchedAreaCode}) {t.clickToSelect}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
              {availableNumbers.map((n) => (
                <button
                  key={n.phoneNumber}
                  onClick={() =>
                    setSelectedNumber(n.phoneNumber === selectedNumber ? null : n.phoneNumber)
                  }
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    selectedNumber === n.phoneNumber
                      ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{n.friendlyName}</p>
                      {(n.locality || n.region) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {[n.locality, n.region].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                    {selectedNumber === n.phoneNumber && (
                      <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedNumber && (
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {formatPhone(selectedNumber)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{t.activationNote}</p>
                  </div>
                  <button
                    onClick={() => {
                      setProvisionError(null);
                      provisionMutation.mutate(selectedNumber);
                    }}
                    disabled={provisionMutation.isPending || !sufficient}
                    className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60"
                  >
                    {provisionMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t.activating}
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        {t.activate}
                      </>
                    )}
                  </button>
                </div>
                {provisionError && (
                  <p className="text-sm text-orange-500 mt-2 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" />
                    {provisionError}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {!availableNumbers && !searching && !searchError && (
          <div className="flex flex-col items-center py-8 text-slate-400 text-sm gap-2">
            <Clock className="w-8 h-8 opacity-30" />
            <p>{t.searchHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SuccessStep({
  settings,
  onToggle,
  toggling,
  toggleError,
}: {
  settings: ReceptionistSettings | undefined;
  onToggle: (v: boolean) => void;
  toggling: boolean;
  toggleError: string | null;
}) {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  const t = {
    title:       pick({ en: "Autumn is ready!",                               vi: "Autumn đã sẵn sàng!",             es: "¡Autumn está lista!",               fr: "Autumn est prête !" }),
    subtitle:    pick({ en: "Your dedicated number is active.",               vi: "Số điện thoại của bạn đã hoạt động.", es: "Tu número dedicado está activo.",  fr: "Votre numéro dédié est actif." }),
    nextSteps:   pick({ en: "Next steps",                                     vi: "Các bước tiếp theo",               es: "Próximos pasos",                    fr: "Prochaines étapes" }),
    ns1:         pick({ en: "Add this number to your Google Business Profile",vi: "Thêm vào Hồ sơ Google Doanh nghiệp", es: "Agrega este número a Google Negocio", fr: "Ajoutez ce numéro à Google My Business" }),
    ns2:         pick({ en: "Include it in your Instagram / social bio",      vi: "Thêm vào tiểu sử Instagram",       es: "Inclúyelo en tu bio de Instagram",  fr: "Incluez-le dans votre bio Instagram" }),
    ns3:         pick({ en: "Text it to existing clients to let them know",   vi: "Nhắn tin cho khách hàng hiện tại", es: "Envíalo por texto a clientes",      fr: "Envoyez-le par SMS à vos clients" }),
    enableTitle: pick({ en: "Enable Autumn",                                  vi: "Bật Autumn",                       es: "Activar Autumn",                    fr: "Activer Autumn" }),
    enableDesc:  pick({ en: "Autumn is inactive — enable her to start answering calls.", vi: "Autumn không hoạt động — bật để trả lời cuộc gọi.", es: "Autumn inactiva — actívala.", fr: "Autumn est inactive — activez-la." }),
    enable:      pick({ en: "Enable",                                         vi: "Bật",                              es: "Activar",                           fr: "Activer" }),
    liveMsg:     pick({ en: "Autumn is live and answering calls",             vi: "Autumn đang trực tiếp và trả lời cuộc gọi", es: "Autumn está en vivo", fr: "Autumn est en ligne" }),
    backDash:    pick({ en: "Back to Dashboard",                              vi: "Về tổng quan",                     es: "Volver al panel",                   fr: "Retour au tableau de bord" }),
  };

  const nextSteps = [
    { icon: "📋", text: t.ns1 },
    { icon: "📸", text: t.ns2 },
    { icon: "💬", text: t.ns3 },
  ];

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="w-20 h-20 rounded-3xl bg-emerald-100 flex items-center justify-center mx-auto mb-5">
        <CheckCircle className="w-10 h-10 text-emerald-500" />
      </div>
      <h2 className="text-3xl font-bold text-slate-800 mb-3">{t.title}</h2>
      <p className="text-slate-500 mb-2">{t.subtitle}</p>

      {settings?.provisionedPhoneNumber && (
        <p className="text-2xl font-bold text-amber-500 mb-8 tracking-tight">
          {formatPhone(settings.provisionedPhoneNumber)}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 text-left shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{t.nextSteps}</p>
        <div className="space-y-3">
          {nextSteps.map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg">{icon}</span>
              <p className="text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {settings && !settings.enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
          <div className="text-left">
            <p className="text-sm font-semibold text-amber-800">{t.enableTitle}</p>
            <p className="text-xs text-amber-600 mt-0.5">{t.enableDesc}</p>
          </div>
          <button
            onClick={() => onToggle(true)}
            disabled={toggling || !settings.apiKeyConfigured}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-5 h-5" />}
            {t.enable}
          </button>
        </div>
      )}

      {settings?.enabled && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-emerald-700">{t.liveMsg}</p>
        </div>
      )}

      {toggleError && <p className="text-sm text-orange-500 mb-4 text-center">{toggleError}</p>}

      <button
        onClick={() => navigate("/manage")}
        className="w-full py-3 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors"
      >
        {t.backDash}
      </button>
    </div>
  );
}

export default function AiReceptionistEnrollment() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("intro");
  const [provisioned, setProvisioned] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<ReceptionistSettings>({
    queryKey: ["/api/ai-receptionist/settings"],
    queryFn: fetchSettings,
  });

  const { pick } = useLanguage();
  const t = {
    loadError: pick({
      en: "Unable to load settings. Please refresh the page.",
      vi: "Không thể tải cài đặt. Vui lòng tải lại trang.",
      es: "No se pueden cargar los ajustes. Por favor recarga la página.",
      fr: "Impossible de charger les paramètres. Veuillez actualiser la page.",
    }),
  };

  const toggleMutation = useMutation({
    mutationFn: toggleEnabled,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai-receptionist/settings"] });
      setToggleError(null);
      setToggling(false);
    },
    onError: (err: Error) => {
      setToggleError(err.message);
      setToggling(false);
    },
  });

  const handleToggle = (v: boolean) => {
    setToggling(true);
    toggleMutation.mutate(v);
  };

  if (settingsLoading) {
    return (
      <AppLayout>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      </AppLayout>
    );
  }

  if (!settings) {
    return (
      <AppLayout>
        <div className="h-64 flex items-center justify-center flex-col gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-slate-500 text-sm">{t.loadError}</p>
        </div>
      </AppLayout>
    );
  }

  const showSuccess = provisioned || (settings.phoneProvisioned && step === "pick");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-6 px-4">
        {showSuccess ? (
          <SuccessStep
            settings={settings}
            onToggle={handleToggle}
            toggling={toggling}
            toggleError={toggleError}
          />
        ) : step === "intro" ? (
          <IntroStep onContinue={() => setStep("pick")} />
        ) : (
          <PhonePickStep
            settings={settings}
            onBack={() => setStep("intro")}
            onProvisioned={() => setProvisioned(true)}
          />
        )}
      </div>
    </AppLayout>
  );
}
