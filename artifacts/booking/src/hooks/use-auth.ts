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

// Some WebViews (notably the native owner app — react-native-webview) can
// have the Set-Cookie from a same-tick fetch() response not yet visible to
// the *next* fetch() fired immediately after, even though both are
// same-origin. The login/register mutations below used to trust the
// response body and immediately invalidateQueries() the rest of the app's
// data in the same tick — if that refetch storm raced the cookie jar, every
// one of those requests came back 401 and, since queries default to
// `retry: false`, silently and permanently rendered as empty. The user still
// looked "logged in" (this hook's own /api/auth/user was set optimistically
// from the login response, never re-checked) but every other page showed no
// account data — intermittently, since it's a timing race, not a hard
// failure. This does one real round-trip to /api/auth/user first (retrying
// once after a short pause if it still 401s) to confirm the cookie actually
// took before trusting it and waking up the rest of the app's queries.
async function verifySessionAfterAuth(fallbackUser: User): Promise<User> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data) return data;
      }
    } catch {
      // network hiccup — fall through to retry/fallback below
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  // Verification was inconclusive twice in a row — fall back to the
  // optimistic user rather than blocking login on a slow/flaky network.
  return fallbackUser;
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
    onSuccess: async (user) => {
      offlineSessionBootstrap.setUser(user);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      const verifiedUser = await verifySessionAfterAuth(user);
      queryClient.setQueryData(["/api/auth/user"], verifiedUser);
      // Any store/staff/appointment queries mounted before login may have been
      // cached from a 401'd/logged-out state — force them to refetch now that
      // the session is authenticated, or the dashboard keeps showing stale
      // empty data until a manual page refresh.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "/api/auth/user" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string; phone?: string; keepSignedIn?: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: async (user) => {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      offlineSessionBootstrap.setUser(user);
      const verifiedUser = await verifySessionAfterAuth(user);
      queryClient.setQueryData(["/api/auth/user"], verifiedUser);
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
