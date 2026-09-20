import { AppLayout } from "@/components/layout/AppLayout";
import { DealsList } from "@/components/services/DealsList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogDeals() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Deals",                                                          vi: "Ưu đãi",                                                     es: "Ofertas",                                                          fr: "Offres" }),
    subtitle: pick({ en: "Turn a package into a limited-time deal customers can buy on the marketplace.", vi: "Biến một gói thành ưu đãi có thời hạn để khách mua trên chợ ứng dụng.", es: "Convierte un paquete en una oferta por tiempo limitado que los clientes pueden comprar en el mercado.", fr: "Transformez un forfait en offre à durée limitée que les clients peuvent acheter sur la marketplace." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <DealsList />
    </AppLayout>
  );
}
