import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Agent } from "@/lib/api";

const DEV_AGENT: Agent = {
  id: 1,
  email: "admin@certxa.com",
  firstName: "Admin",
  lastName: "Dev",
  role: "admin",
  name: "Admin Dev",
};

export function useAuth() {
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.login(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-me"] }),
  });

  const logout = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => qc.clear(),
  });

  return { agent: DEV_AGENT, isLoading: false, login, logout };
}
