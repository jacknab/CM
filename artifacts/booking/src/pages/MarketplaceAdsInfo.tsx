import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useLanguage } from "@/hooks/use-language";
import { Store, Search, ShoppingCart, CalendarCheck, Wallet, TrendingUp, ImageIcon, Clock3, ArrowRight } from "lucide-react";

// Certxa's cut of every redeemed voucher — kept in sync with the real value
// in artifacts/api-server/src/lib/dealVoucherPayouts.ts (DEAL_COMMISSION_RATE).
// If that ever changes, update it here too — this page states it as fact.
const COMMISSION_PERCENT = 10;

const steps = [
  {
    icon: Store,
    title: "Turn a package into a deal",
    body: "Pick one of your existing service packages, set a deal price, how many you're offering, and how long the sale runs. Takes a couple of minutes.",
  },
  {
    icon: Search,
    title: "It goes live on Certxa Marketplace",
    body: "Your deal appears on certxa.com alongside your real salon profile — photos, services, and reviews — in front of people actively searching for a place nearby.",
  },
  {
    icon: ShoppingCart,
    title: "A customer buys it",
    body: "They pay upfront for a voucher. That's a new customer committed to visiting — not just a click or a like.",
  },
  {
    icon: CalendarCheck,
    title: "They book and come in",
    body: "The customer books their appointment using the voucher, just like any other booking on your calendar.",
  },
  {
    icon: Wallet,
    title: "You get paid when they redeem it",
    body: `The moment their appointment is checked in, your share of the sale — the deal price minus Certxa's ${COMMISSION_PERCENT}% commission — is transferred straight to your connected Stripe account.`,
  },
];

const reasons = [
  {
    icon: TrendingUp,
    title: "Pay only for real visits",
    body: "There's no upfront cost to list a deal, and no fee at all until a customer actually redeems their voucher in your salon. You're not paying for clicks or impressions — only for people who show up.",
  },
  {
    icon: Search,
    title: "Reach people already looking",
    body: "Deals surface to people actively searching Certxa Marketplace for a salon nearby — a warmer audience than a general ad, because they're already looking to book something.",
  },
  {
    icon: ImageIcon,
    title: "Backed by your real profile",
    body: "Every deal links back to your actual salon profile — real photos, services, and reviews — not a bare coupon. It's a fuller pitch than a discount code alone.",
  },
  {
    icon: Clock3,
    title: "Fill the slow periods",
    body: "Set your own sale window and how many vouchers you're offering, so a deal can be timed to fill a slow week or a new service you want to introduce.",
  },
];

const faqs = [
  {
    q: "When do I actually get paid?",
    a: `Not at purchase — at redemption. Certxa collects the full payment when a customer buys a voucher, but that money only moves to you when the customer actually comes in and their appointment is checked in. If a voucher is never redeemed, no payout happens for it — you're only paid for real visits.`,
  },
  {
    q: "What does Certxa take?",
    a: `A flat ${COMMISSION_PERCENT}% commission on the deal price, taken only from redeemed vouchers. The rest is transferred directly to your connected Stripe account the moment the appointment starts.`,
  },
  {
    q: "Does it cost anything to list a deal?",
    a: "No upfront cost. You only pay the commission, and only on vouchers that actually get redeemed.",
  },
  {
    q: "Do I need anything set up to receive the payout?",
    a: "Your salon needs a connected Stripe account with payouts enabled — the same one used for your regular card payments. If it isn't connected yet, redemption payouts are held until it is, rather than lost.",
  },
  {
    q: "How long is a voucher valid after someone buys it?",
    a: "You choose — 30, 60, or 90 days from the purchase date. That's separate from the deal's own sale window (how long you're offering it for new purchases).",
  },
  {
    q: "Can I control the price and how many I sell?",
    a: "Yes. You set the deal price, the number available, and the start and end dates for the sale when you create it. You can pause or archive a deal at any time.",
  },
  {
    q: "Where exactly does my deal show up?",
    a: "On Certxa Marketplace (certxa.com) — the customer-facing directory where people search for and book independent salons — attached to your salon's real public profile.",
  },
];

export default function MarketplaceAdsInfo() {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  const t = {
    title: pick({ en: "Marketplace Ads", vi: "Quảng cáo trên chợ ứng dụng", es: "Anuncios en el mercado", fr: "Annonces sur la marketplace" }),
    subtitle: pick({
      en: "Turn a service into a deal that brings new clients in the door.",
      vi: "Biến một dịch vụ thành ưu đãi để thu hút khách hàng mới.",
      es: "Convierte un servicio en una oferta que atraiga nuevos clientes.",
      fr: "Transformez un service en offre qui attire de nouveaux clients.",
    }),
    cta: pick({ en: "Create a Deal", vi: "Tạo ưu đãi", es: "Crear oferta", fr: "Créer une offre" }),
    howItWorks: pick({ en: "How it works", vi: "Cách hoạt động", es: "Cómo funciona", fr: "Comment ça marche" }),
    whyItWorks: pick({ en: "Why salon owners use it", vi: "Vì sao chủ salon sử dụng", es: "Por qué lo usan los dueños de salones", fr: "Pourquoi les propriétaires l'utilisent" }),
    faqTitle: pick({ en: "Frequently asked questions", vi: "Câu hỏi thường gặp", es: "Preguntas frecuentes", fr: "Questions fréquentes" }),
  };

  return (
    <AppLayout>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white px-6 py-10 sm:px-10 sm:py-14 mb-10">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase mb-4">
            <Store className="w-3.5 h-3.5" />
            Certxa Marketplace
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">{t.title}</h1>
          <p className="text-teal-50 text-base sm:text-lg leading-relaxed mb-6">{t.subtitle}</p>
          <Button
            onClick={() => navigate("/catalog/deals")}
            data-testid="button-create-deal-cta"
            className="bg-white text-teal-700 hover:bg-teal-50 font-semibold gap-2"
          >
            {t.cta}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-10">
        <h2 className="text-xl font-display font-bold mb-5">{t.howItWorks}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <Card key={step.title} className="relative">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-300">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Why it works */}
      <div className="mb-10">
        <h2 className="text-xl font-display font-bold mb-5">{t.whyItWorks}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {reasons.map((reason) => (
            <Card key={reason.title}>
              <CardContent className="p-5 flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                  <reason.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{reason.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{reason.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="mb-6">
        <h2 className="text-xl font-display font-bold mb-5">{t.faqTitle}</h2>
        <Card>
          <CardContent className="p-2 sm:p-4">
            <Accordion type="single" collapsible>
              {faqs.map((faq, i) => (
                <AccordionItem key={faq.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-sm font-semibold">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center pb-4">
        <Button
          onClick={() => navigate("/catalog/deals")}
          data-testid="button-create-deal-cta-bottom"
          variant="outline"
          className="gap-2"
        >
          {t.cta}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </AppLayout>
  );
}
