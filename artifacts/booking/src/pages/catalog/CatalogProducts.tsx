import { AppLayout } from "@/components/layout/AppLayout";
import { ProductsList } from "@/components/services/ProductsList";
import { useLanguage } from "@/hooks/use-language";

export default function CatalogProducts() {
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Products",                                          vi: "Sản phẩm",                        es: "Productos",                          fr: "Produits" }),
    subtitle: pick({ en: "Manage retail products and inventory for your salon.", vi: "Quản lý sản phẩm bán lẻ.", es: "Administra tus productos e inventario.", fr: "Gérez vos produits et votre inventaire." }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>
      <ProductsList />
    </AppLayout>
  );
}
