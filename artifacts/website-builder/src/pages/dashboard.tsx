import { Link } from "wouter";
import { useGetDashboardStats, useListWebsites } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Globe, LayoutTemplate, Store, Scissors, AlignLeft } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: websites, isLoading: websitesLoading } = useListWebsites();
  const isAdmin = useIsAdmin();

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">Welcome to Certxa.</h1>
          <p className="text-gray-600 text-lg">Manage your salon websites and templates.</p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href="/templates/import">
              <Button variant="outline" className="rounded-full border-gray-200 text-[#3B0764] hover:bg-gray-50 h-11 px-6">
                <Download className="w-4 h-4 mr-2" />
                Import Template
              </Button>
            </Link>
          )}
          <Link href="/websites/new">
            <Button className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white shadow-[0px_8px_32px_0px_rgba(201,123,43,0.25)] h-11 px-6">
              <Plus className="w-4 h-4 mr-2" />
              Create Website
            </Button>
          </Link>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Websites</CardTitle>
              <Globe className="w-4 h-4 text-[#C97B2B]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#3B0764]">{stats?.totalWebsites || 0}</div>
            </CardContent>
          </Card>
          
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Published</CardTitle>
              <Globe className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#3B0764]">{stats?.publishedWebsites || 0}</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Templates</CardTitle>
              <LayoutTemplate className="w-4 h-4 text-[#3B0764]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#3B0764]">{stats?.totalTemplates || 0}</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-gray-100 shadow-sm bg-[#fafafa]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">By Category</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-gray-600"><Scissors className="w-3 h-3"/> Hair</span>
                <span className="font-semibold">{stats?.templatesByCategory?.hair_salon || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-gray-600"><Store className="w-3 h-3"/> Barber</span>
                <span className="font-semibold">{stats?.templatesByCategory?.barbershop || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-gray-600"><AlignLeft className="w-3 h-3"/> Nail</span>
                <span className="font-semibold">{stats?.templatesByCategory?.nail_salon || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-bold text-[#3B0764]">Recent Websites</h2>
          <Link href="/websites" className="text-sm font-medium text-[#C97B2B] hover:underline">
            View All
          </Link>
        </div>

        {websitesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : !websites || websites.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-2 bg-gray-50 flex flex-col items-center justify-center py-16">
            <Globe className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium mb-6">No websites created yet.</p>
            <Link href="/websites/new">
              <Button className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white">
                Create First Website
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {websites.slice(0, 5).map((website) => (
              <Link key={website.id} href={`/websites/${website.id}/edit`}>
                <Card className="rounded-xl border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden group">
                  <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-full bg-[#3B0764]/5 flex items-center justify-center text-[#3B0764] group-hover:bg-[#3B0764] group-hover:text-white transition-colors">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-[#C97B2B] transition-colors">{website.name}</h3>
                        <p className="text-sm text-gray-500 font-mono mt-1">{website.slug}.certxa.com</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {website.published ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 rounded-full px-3 font-medium">Published</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-100 rounded-full px-3 font-medium">Draft</Badge>
                      )}
                      <div className="text-[#3B0764] font-medium text-sm group-hover:underline">Edit</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
