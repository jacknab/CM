import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

/**
 * Thin redirect shim: given a staff ID in the URL, looks up the corresponding
 * contractor and forwards to /payouts/contractors/:contractorId (preserving
 * any ?tab= or other query params).
 *
 * Route: /payouts/contractors/by-staff/:staffId
 */
export default function ContractorByStaffId() {
  const { staffId } = useParams<{ staffId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data, isError, isLoading } = useQuery<{ id: number } | null>({
    queryKey: ["/api/contractor-payouts/contractors/by-staff", staffId],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/contractors/by-staff/${staffId}`,
        { credentials: "include" },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to look up contractor");
      return res.json();
    },
    enabled: !!staffId,
    retry: false,
  });

  useEffect(() => {
    if (isLoading) return;

    const qs = searchParams.toString();
    const suffix = qs ? `?${qs}` : "";

    if (data?.id) {
      // Forward to the real contractor detail page
      navigate(`/payouts/contractors/${data.id}${suffix}`, { replace: true });
    } else {
      // No contractor record yet — go to the team list
      navigate("/payouts/contractors", { replace: true });
    }
  }, [data, isLoading, isError, navigate, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
