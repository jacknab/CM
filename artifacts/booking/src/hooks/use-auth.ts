import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";
import { offlineSessionBootstrap } from "@/lib/offline-session-bootstrap";

const STORAGE_KEY = "booking_user_session";

async function fetchUser(): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/user", {
      credentials: "include",
    });

    if (response.status === 401 || response.status === 403) {
      offlineSessionBootstrap.clear();
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);

    const data = await response.json();
    if (data) offlineSessionBootstrap.setUser(data);
    return data ?? null;
  } catch (error) {
    const cachedUser = offlineSessionBootstrap.getUser();
    if (cachedUser && typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true") {
      return cachedUser;
    }
    throw error;
  }
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
      offlineSessionBootstrap.setUser(user);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      // Any store/staff/appointment queries mounted before login may have been
      // cached from a 401'd/logged-out state — force them to refetch now that
      // the session is authenticated, or the dashboard keeps showing stale
      // empty data until a manual page refresh.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "/api/auth/user" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string; keepSignedIn?: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: (user) => {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      offlineSessionBootstrap.setUser(user);
      queryClient.setQueryData(["/api/auth/user"], user);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "/api/auth/user" });
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
        offlineSessionBootstrap.clear();
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
