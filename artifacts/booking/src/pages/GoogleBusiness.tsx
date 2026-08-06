import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoogleBusinessProfileSetup } from "@/components/GoogleBusinessProfileSetup";
import { GoogleReviewsManager } from "@/components/GoogleReviewsManager";
import { GoogleServicesSync } from "@/components/GoogleServicesSync";
import { GoogleHoursSync } from "@/components/GoogleHoursSync";
import { GoogleReviewEngine } from "@/components/GoogleReviewEngine";
import { GoogleBusinessPhotos } from "@/components/GoogleBusinessPhotos";
import { useSelectedStore } from "@/hooks/use-store";
import { useLanguage } from "@/hooks/use-language";
import { Building2, Loader2, Star, Scissors, Clock, Sparkles, Images } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function GoogleBusiness() {
  const { selectedStore, isLoading } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const [activeTab, setActiveTab] = useState<string>("setup");
  const { pick } = useLanguage();

  const t = {
    title:          pick({ en: "Google Business Profile",                                                         vi: "Hồ sơ Google Doanh nghiệp",                                                        es: "Perfil de Google Negocio",                                                              fr: "Profil Google My Business" }),
    subtitle:       pick({ en: "Connect your Google Business Profile to manage reviews and sync your services", vi: "Kết nối hồ sơ Google Doanh nghiệp để quản lý đánh giá và đồng bộ dịch vụ",          es: "Conecta tu perfil de Google Negocio para gestionar reseñas y sincronizar servicios",    fr: "Connectez votre profil Google My Business pour gérer les avis et synchroniser les services" }),
    noStoreTitle:   pick({ en: "No Store Found",                                                                  vi: "Không tìm thấy cửa hàng",                                                          es: "No se encontró ninguna tienda",                                                         fr: "Aucune boutique trouvée" }),
    noStoreDesc:    pick({ en: "You need to complete onboarding and create a store before connecting your Google Business Profile.", vi: "Bạn cần hoàn thành quá trình nhập môn và tạo cửa hàng trước khi kết nối Hồ sơ Google Doanh nghiệp.", es: "Necesitas completar el proceso de incorporación y crear una tienda antes de conectar tu Perfil de Google Negocio.", fr: "Vous devez terminer l'intégration et créer une boutique avant de connecter votre profil Google My Business." }),
    connection:     pick({ en: "Connection",    vi: "Kết nối",    es: "Conexión",   fr: "Connexion" }),
    reviews:        pick({ en: "Reviews",      vi: "Đánh giá",   es: "Reseñas",    fr: "Avis" }),
    services:       pick({ en: "Services",     vi: "Dịch vụ",    es: "Servicios",  fr: "Services" }),
    hours:          pick({ en: "Hours",        vi: "Giờ",         es: "Horario",    fr: "Horaires" }),
    autoResponse:   pick({ en: "Auto-Response",vi: "Tự động trả lời", es: "Respuesta Auto", fr: "Réponse Auto" }),
    photos:         pick({ en: "Photos",        vi: "Ảnh",           es: "Fotos",         fr: "Photos" }),
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t.subtitle}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        ) : !storeId ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-amber-800">{t.noStoreTitle}</CardTitle>
              <CardDescription className="text-amber-700">{t.noStoreDesc}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="setup" className="gap-2">
                <Building2 size={15} />
                {t.connection}
              </TabsTrigger>
              <TabsTrigger value="reviews" className="gap-2">
                <Star size={15} />
                {t.reviews}
              </TabsTrigger>
              <TabsTrigger value="services" className="gap-2">
                <Scissors size={15} />
                {t.services}
              </TabsTrigger>
              <TabsTrigger value="hours" className="gap-2">
                <Clock size={15} />
                {t.hours}
              </TabsTrigger>
              <TabsTrigger value="auto-response" className="gap-2">
                <Sparkles size={15} />
                {t.autoResponse}
              </TabsTrigger>
              <TabsTrigger value="photos" className="gap-2">
                <Images size={15} />
                {t.photos}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup">
              <GoogleBusinessProfileSetup storeId={storeId} onConnectSuccess={() => setActiveTab("reviews")} />
            </TabsContent>

            <TabsContent value="reviews">
              <GoogleReviewsManager storeId={storeId} />
            </TabsContent>

            <TabsContent value="services">
              <GoogleServicesSync storeId={storeId} />
            </TabsContent>

            <TabsContent value="hours">
              <GoogleHoursSync storeId={storeId} />
            </TabsContent>

            <TabsContent value="auto-response">
              <GoogleReviewEngine storeId={storeId} />
            </TabsContent>

            <TabsContent value="photos">
              <GoogleBusinessPhotos storeId={storeId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
