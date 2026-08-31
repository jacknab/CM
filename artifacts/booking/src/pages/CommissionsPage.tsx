import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useLanguage } from "@/hooks/use-language";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TrendingUp, Zap, Users, BarChart2, ArrowRight, Percent, CheckCircle2 } from "lucide-react";


// ── Upsell page shown when commissions are not yet set up ─────────────────────

function CommissionsUpsell({ onSetUp }: { onSetUp: () => void }) {
  const { pick } = useLanguage();
  const t = {
    commissions:   pick({ en: "Commissions",          vi: "Hoa hồng",                       es: "Comisiones",                       fr: "Commissions" }),
    subtitle:      pick({ en: "Motivate your team with performance-based pay", vi: "Khích lệ đội ngũ bằng lương theo hiệu suất", es: "Motiva a tu equipo con pago según el rendimiento", fr: "Motivez votre équipe avec une rémunération à la performance" }),
    illustrationAlt: pick({ en: "Commission split illustration", vi: "Minh họa chia hoa hồng",          es: "Ilustración de reparto de comisiones", fr: "Illustration du partage des commissions" }),
    badge:         pick({ en: "Commission Management",  vi: "Quản lý hoa hồng",                es: "Gestión de comisiones",            fr: "Gestion des commissions" }),
    headingA:      pick({ en: "Automate Staff",         vi: "Tự động hóa hoa hồng",            es: "Automatiza las comisiones",        fr: "Automatisez les commissions" }),
    headingB:      pick({ en: "Commissions",            vi: "cho nhân viên",                   es: "del personal",                     fr: "du personnel" }),
    blurb:         pick({ en: "Create commission rules once. Certxa tracks completed services and calculates employee earnings automatically.", vi: "Tạo quy tắc hoa hồng một lần. Certxa theo dõi dịch vụ đã hoàn thành và tự động tính thu nhập cho nhân viên.", es: "Crea las reglas de comisión una vez. Certxa registra los servicios completados y calcula las ganancias de los empleados automáticamente.", fr: "Créez les règles de commission une seule fois. Certxa suit les services réalisés et calcule automatiquement les gains des employés." }),
    feat1:         pick({ en: "Custom rates per staff member or role", vi: "Tỷ lệ tùy chỉnh theo từng nhân viên hoặc vai trò", es: "Tarifas personalizadas por empleado o función", fr: "Taux personnalisés par employé ou par rôle" }),
    feat2:         pick({ en: "Auto-calculated after every appointment", vi: "Tự động tính sau mỗi lịch hẹn", es: "Cálculo automático tras cada cita", fr: "Calcul automatique après chaque rendez-vous" }),
    feat3:         pick({ en: "Built-in reporting synced with payroll", vi: "Báo cáo tích hợp, đồng bộ với bảng lương", es: "Informes integrados sincronizados con la nómina", fr: "Rapports intégrés synchronisés avec la paie" }),
    cta:           pick({ en: "Set up commissions",    vi: "Thiết lập hoa hồng",              es: "Configurar comisiones",            fr: "Configurer les commissions" }),
    s1Title:       pick({ en: "Flexible structures",   vi: "Cấu trúc linh hoạt",              es: "Estructuras flexibles",            fr: "Structures flexibles" }),
    s1Desc:        pick({ en: "Set flat rates, tiered brackets, or per-service splits — whatever fits your team.", vi: "Đặt tỷ lệ cố định, bậc thang, hoặc chia theo từng dịch vụ — tùy theo đội ngũ của bạn.", es: "Establece tarifas fijas, tramos escalonados o repartos por servicio — lo que se adapte a tu equipo.", fr: "Définissez des taux fixes, des paliers ou des répartitions par service — selon votre équipe." }),
    s2Title:       pick({ en: "Real-time visibility",  vi: "Xem theo thời gian thực",         es: "Visibilidad en tiempo real",       fr: "Visibilité en temps réel" }),
    s2Desc:        pick({ en: "Staff see their own earnings live. Owners see the full breakdown at a glance.", vi: "Nhân viên xem thu nhập của mình theo thời gian thực. Chủ tiệm xem toàn bộ chi tiết trong nháy mắt.", es: "El personal ve sus ganancias en vivo. Los propietarios ven el desglose completo de un vistazo.", fr: "Le personnel voit ses gains en direct. Les propriétaires voient le détail complet d'un coup d'œil." }),
    s3Title:       pick({ en: "Payroll-ready",         vi: "Sẵn sàng cho bảng lương",         es: "Listo para la nómina",             fr: "Prêt pour la paie" }),
    s3Desc:        pick({ en: "Commission totals flow directly into your payroll run — no manual math needed.", vi: "Tổng hoa hồng chuyển thẳng vào đợt trả lương — không cần tính tay.", es: "Los totales de comisión pasan directamente a tu nómina — sin cálculos manuales.", fr: "Les totaux de commission alimentent directement votre paie — aucun calcul manuel." }),
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex flex-col">
      {/* Page header */}
      <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{t.commissions}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Hero section */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8 sm:py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">

          {/* Illustration — shown second on mobile (order-2), first on desktop */}
          <div className="relative flex items-center justify-center order-2 lg:order-1">
            <img
              src="/commissions-illustration.jpg"
              alt={t.illustrationAlt}
              className="w-full max-w-sm sm:max-w-lg lg:max-w-2xl rounded-2xl sm:rounded-3xl object-contain drop-shadow-xl"
            />
          </div>

          {/* Copy + CTA — shown first on mobile (order-1), second on desktop */}
          <div className="space-y-6 sm:space-y-8 order-1 lg:order-2">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-[12px] font-semibold px-3 py-1 rounded-full mb-3 sm:mb-4">
                <Percent size={12} />
                {t.badge}
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-[1.15] tracking-tight">
                {t.headingA}<br />{t.headingB}
              </h2>
              <p className="text-gray-500 text-sm sm:text-base mt-3 sm:mt-4 leading-relaxed max-w-sm">
                {t.blurb}
              </p>
            </div>

            {/* Feature list */}
            <ul className="space-y-2.5 sm:space-y-3">
              {[
                { icon: Users,      text: t.feat1 },
                { icon: Zap,        text: t.feat2 },
                { icon: TrendingUp, text: t.feat3 },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center mt-0.5">
                    <CheckCircle2 size={13} className="text-indigo-500" />
                  </div>
                  <span className="text-gray-700 text-[14px] leading-snug">{text}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="flex items-center gap-3">
              <Button
                onClick={onSetUp}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold text-[14px] shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
              >
                {t.cta}
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom feature strip */}
      <div className="border-t border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {[
            {
              icon: Percent,
              title: t.s1Title,
              desc: t.s1Desc,
            },
            {
              icon: BarChart2,
              title: t.s2Title,
              desc: t.s2Desc,
            },
            {
              icon: TrendingUp,
              title: t.s3Title,
              desc: t.s3Desc,
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Icon size={16} className="text-indigo-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">{title}</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page: gate on whether commissions are configured ──────────────────────

export default function CommissionsPage() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();

  // Check if any commission structures have been created
  const { data: structures = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(
        `/api/contractor-payouts/commission-structures?storeId=${selectedStore.id}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
    staleTime: 60_000,
  });

  // While loading, show nothing (avoids flash)
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // No structures set up → show upsell
  if (structures.length === 0) {
    return (
      <AppLayout fullHeight>
        <CommissionsUpsell onSetUp={() => navigate("/commissions/new")} />
      </AppLayout>
    );
  }

  // Structures exist → redirect to the full management page
  navigate("/payouts/commissions", { replace: true });
  return null;
}
