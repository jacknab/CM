import { Link } from "react-router-dom";
import { Languages } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ServicesList } from "@/components/services/ServicesList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogServices() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Services",                                           vi: "Dịch vụ",                              es: "Servicios",                            fr: "Services" }),
    subtitle: pick({ en: "Manage the services you offer and their pricing.",   vi: "Quản lý các dịch vụ và giá của bạn.", es: "Administra tus servicios y precios.",  fr: "Gérez vos services et leurs tarifs." }),
    translations: pick({ en: "Translations", vi: "Bản dịch", es: "Traducciones", fr: "Traductions" }),
  };

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/catalog/translations">
            <Languages className="mr-2 h-4 w-4" />
            {t.translations}
          </Link>
        </Button>
      </div>
      <ServicesList />
    </AppLayout>
  );
}
