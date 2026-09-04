import { AppLayout } from "@/components/layout/AppLayout";
import { PackagesList } from "@/components/services/PackagesList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogPackages() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Packages",                                              vi: "Gói dịch vụ",                                    es: "Paquetes",                                       fr: "Forfaits" }),
    subtitle: pick({ en: "Bundle existing services and add-ons into one priced item.", vi: "Gộp các dịch vụ và bổ sung sẵn có thành một mục có giá.", es: "Agrupa servicios y complementos existentes en un solo artículo con precio.", fr: "Regroupez des services et suppléments existants en un seul article tarifé." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <PackagesList />
    </AppLayout>
  );
}
