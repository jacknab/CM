import { AppLayout } from "@/components/layout/AppLayout";
import { ServicesList } from "@/components/services/ServicesList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogServices() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Services",                                           vi: "Dịch vụ",                              es: "Servicios",                            fr: "Services" }),
    subtitle: pick({ en: "Manage the services you offer and their pricing.",   vi: "Quản lý các dịch vụ và giá của bạn.", es: "Administra tus servicios y precios.",  fr: "Gérez vos services et leurs tarifs." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <ServicesList />
    </AppLayout>
  );
}
