import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supportApi, type SupportAgent } from "@/lib/support-api";

const DEV_AGENT: SupportAgent = {
  id: 1,
  email: "admin@certxa.com",
  firstName: "Admin",
  lastName: "Dev",
  role: "admin",
  name: "Admin Dev",
};

export function useSupportAuth() {
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      supportApi.auth.login(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-me"] }),
  });

  const logout = useMutation({
    mutationFn: () => supportApi.auth.logout(),
    onSuccess: () => qc.clear(),
  });

  return { agent: DEV_AGENT, isLoading: false, login, logout };
}
