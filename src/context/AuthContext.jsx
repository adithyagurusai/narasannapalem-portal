/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

function getPortalDeviceId() {
  const storageKey = "narasannapalem_portal_device_id";

  try {
    let deviceId = window.localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = window.crypto?.randomUUID?.();
      if (!deviceId) {
        deviceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      window.localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
  } catch {
    // Storage can be disabled in private browsing. This fallback identifies
    // this tab for the duration of the page lifetime.
    if (!window.__portalDeviceId) {
      window.__portalDeviceId =
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return window.__portalDeviceId;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Prevent older profile requests from overwriting newer auth state.
  const requestId = useRef(0);
  const profileRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // User signed out or no session exists.
      if (!newSession) {
        requestId.current++;
        profileRef.current = null;
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(newSession);

      // Token refreshes and other same-user auth events must not tear down
      // the authenticated shell. Only load the profile for a new session,
      // initial hydration, or an explicit sign-in.
      const sameUserProfile = profileRef.current?.id === newSession.user.id;
      const needsProfile =
        !sameUserProfile ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION";

      if (!needsProfile) {
        return;
      }

      const currentRequest = ++requestId.current;

      // Wait for the auth callback to finish before querying Supabase.
      setLoading(true);
      profileRef.current = null;
      setProfile(null);

      setTimeout(async () => {
        if (!mounted || currentRequest !== requestId.current) return;

        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, display_name, role, is_active")
            .eq("id", newSession.user.id)
            .maybeSingle();

          if (error) throw error;

          if (!mounted || currentRequest !== requestId.current) return;

          if (!data || !data.is_active) {
            profileRef.current = null;
            setSession(null);
            setProfile(null);
            await supabase.auth.signOut();
            return;
          }

          profileRef.current = data;
          setProfile(data);
        } catch (error) {
          console.error("Profile loading failed:", error);

          if (mounted && currentRequest === requestId.current) {
            profileRef.current = null;
            setSession(null);
            setProfile(null);
            await supabase.auth.signOut();
          }
        } finally {
          if (mounted && currentRequest === requestId.current) {
            setLoading(false);
          }
        }
      }, 0);
    });

    return () => {
      mounted = false;
      requestId.current++;
      subscription.unsubscribe();
    };
  }, []);

  // Keep the app-managed session alive only while the portal is visible.
  // Returning to a tab triggers an immediate check; ordinary tab switches do
  // not reload the page or re-fetch the user's profile.
  useEffect(() => {
    if (!session?.user?.id || !profile?.id) return undefined;

    let disposed = false;
    let checking = false;

    const checkSession = async () => {
      if (
        disposed ||
        checking ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      checking = true;
      try {
        const { data, error } = await supabase.functions.invoke(
          "manage-users",
          { body: { action: "heartbeat" } }
        );

        if (disposed) return;

        const status = error?.context?.status;
        const sessionRejected =
          status === 401 ||
          status === 403 ||
          data?.error === "SESSION_REVOKED" ||
          data?.error === "ACCOUNT_INACTIVE";

        if (sessionRejected) {
          await supabase.auth.signOut();
          return;
        }

        if (error) {
          // A transient network issue must not log the user out.
          console.warn("Session heartbeat failed:", error.message);
        }
      } catch (error) {
        console.warn("Session heartbeat failed:", error);
      } finally {
        checking = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    };

    const intervalId = window.setInterval(checkSession, 60 * 1000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", checkSession);
    checkSession();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", checkSession);
    };
  }, [session?.user?.id, profile?.id]);

  async function login(displayName, password) {
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: {
        action: "login",
        display_name: String(displayName ?? "").trim(),
        password,
        device_id: getPortalDeviceId(),
        user_agent: navigator.userAgent,
      },
    });

    if (error) {
      let response;
      if (error.context && typeof error.context.json === "function") {
        try {
          response = await error.context.json();
        } catch (parseError) {
          console.error("Login error response could not be parsed:", parseError);
        }
      }

      throw new Error(response?.error || error.message || "Unable to sign in.");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.session?.access_token || !data?.session?.refresh_token) {
      throw new Error("Unable to sign in.");
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession(data.session);

    if (sessionError) throw sessionError;

    // The auth listener loads the profile after SIGNED_IN.
    return sessionData;
  }

  async function logout() {
    // End the app-managed device session before clearing the Supabase token.
    // Sign-out still proceeds if this best-effort tracking request fails.
    const { error: sessionEndError } = await supabase.functions.invoke(
      "manage-users",
      { body: { action: "logout_session" } }
    );
    if (sessionEndError) {
      console.warn("Unable to mark the device session as ended:", sessionEndError);
    }

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    profileRef.current = null;
    setSession(null);
    setProfile(null);
    setLoading(false);
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    login,
    logout,
    isAdmin: profile?.role === "admin",
    isViewer: profile?.role === "viewer",
    isEditor: false,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

