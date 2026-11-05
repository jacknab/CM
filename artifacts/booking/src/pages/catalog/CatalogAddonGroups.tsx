import { AppLayout } from "@/components/layout/AppLayout";
import { AddonGroupsList } from "@/components/services/AddonGroupsList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogAddonGroups() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Add-on Groups",                                                     vi: "Nhóm dịch vụ thêm",                                                   es: "Grupos de complementos",                                                    fr: "Groupes de suppléments" }),
    subtitle: pick({ en: "Reusable sets of existing add-ons you can give to many services.", vi: "Các bộ dịch vụ thêm sẵn có, dùng lại được cho nhiều dịch vụ.", es: "Conjuntos reutilizables de complementos existentes para varios servicios.", fr: "Ensembles réutilisables de suppléments existants pour plusieurs services." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <AddonGroupsList />
    </AppLayout>
  );
}
