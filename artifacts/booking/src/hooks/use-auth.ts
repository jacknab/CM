import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";

const STORAGE_KEY = "booking_user_session";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);

  const data = await response.json();
  return data ?? null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const hasStoredSession = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    gcTime: Infinity,
  });

  // --- Email/Password Mutations ---
  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; keepSignedIn?: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string; keepSignedIn?: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: (user) => {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = "/auth";
      }
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    hasStoredSession,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
