import { AppLayout } from "@/components/layout/AppLayout";
import { CategoryManager } from "@/components/services/CategoryManager";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogCategories() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Categories",                                vi: "Danh mục",             es: "Categorías",          fr: "Catégories" }),
    subtitle: pick({ en: "Organise your services into categories.",   vi: "Tổ chức dịch vụ của bạn.", es: "Organiza tus servicios.", fr: "Organisez vos services." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <div className="bg-card border rounded-md p-6">
        <CategoryManager />
      </div>
    </AppLayout>
  );
}
