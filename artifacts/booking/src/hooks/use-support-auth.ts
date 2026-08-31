import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportApi, type SupportAgent } from "@/lib/support-api";

const SUPPORT_ME_KEY = ["support-me"] as const;

export function useSupportAuth() {
  const qc = useQueryClient();

  const meQuery = useQuery<SupportAgent>({
    queryKey: SUPPORT_ME_KEY,
    queryFn: () => supportApi.auth.me(),
    retry: false,
    staleTime: 60_000,
  });

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      supportApi.auth.login(email, password),
    onSuccess: (agent) => qc.setQueryData(SUPPORT_ME_KEY, agent),
  });

  const logout = useMutation({
    mutationFn: () => supportApi.auth.logout(),
    onSuccess: () => {
      qc.setQueryData(SUPPORT_ME_KEY, null);
      qc.clear();
    },
  });

  return {
    // A failed /auth/me (401 when nobody's logged in) surfaces as a query
    // error, not a thrown exception — treat that the same as "no agent".
    agent: meQuery.isError ? null : meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    login,
    logout,
  };
}
