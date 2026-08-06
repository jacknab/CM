import { AppLayout } from "@/components/layout/AppLayout";
import { AddonsList } from "@/components/services/AddonsList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogAddons() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Add-Ons",                                              vi: "Bổ sung",                               es: "Complementos",                          fr: "Suppléments" }),
    subtitle: pick({ en: "Create optional extras that clients can add to any service.", vi: "Tạo các tiện ích bổ sung tùy chọn.", es: "Crea extras opcionales para tus servicios.", fr: "Créez des extras optionnels pour vos services." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <AddonsList />
    </AppLayout>
  );
}
