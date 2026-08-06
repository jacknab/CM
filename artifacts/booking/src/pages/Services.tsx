import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServicesList } from "@/components/services/ServicesList";
import { CategoryManager } from "@/components/services/CategoryManager";
import { AddonsList } from "@/components/services/AddonsList";
import { ProductsList } from "@/components/services/ProductsList";
import { useLanguage } from "@/hooks/use-language";

export default function Services() {
  const { pick } = useLanguage();

  const t = {
    title:       pick({ en: "Services & Products",                                              vi: "Dịch vụ & Sản phẩm",                                        es: "Servicios y Productos",                                         fr: "Services et Produits" }),
    subtitle:    pick({ en: "Manage your service menu, add-ons, and product inventory.",        vi: "Quản lý thực đơn dịch vụ, tiện ích bổ sung và hàng tồn kho.", es: "Administra tu menú de servicios, complementos e inventario.",    fr: "Gérez votre menu de services, suppléments et inventaire." }),
    categories:  pick({ en: "Categories",  vi: "Danh mục",    es: "Categorías",  fr: "Catégories" }),
    services:    pick({ en: "Services",    vi: "Dịch vụ",     es: "Servicios",   fr: "Services" }),
    addons:      pick({ en: "Add-Ons",     vi: "Bổ sung",     es: "Complementos",fr: "Suppléments" }),
    products:    pick({ en: "Products",    vi: "Sản phẩm",    es: "Productos",   fr: "Produits" }),
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>

      <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="categories">{t.categories}</TabsTrigger>
          <TabsTrigger value="services">{t.services}</TabsTrigger>
          <TabsTrigger value="addons">{t.addons}</TabsTrigger>
          <TabsTrigger value="products">{t.products}</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <div className="bg-card border rounded-md p-6">
            <CategoryManager />
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <ServicesList />
        </TabsContent>

        <TabsContent value="addons" className="space-y-4">
          <AddonsList />
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <ProductsList />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
