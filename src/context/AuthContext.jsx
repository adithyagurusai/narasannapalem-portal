
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Prevent older profile requests from overwriting newer auth state.
  const requestId = useRef(0);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const currentRequest = ++requestId.current;

      // User signed out or no session exists.
      if (!newSession) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(newSession);

      // Refreshing a token does not require reloading the profile.
      if (event === "TOKEN_REFRESHED" && profile) {
        return;
      }

      // Wait for the auth callback to finish before querying Supabase.
      setLoading(true);
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
            setSession(null);
            setProfile(null);
            await supabase.auth.signOut();
            return;
          }

          setProfile(data);
        } catch (error) {
          console.error("Profile loading failed:", error);

          if (mounted && currentRequest === requestId.current) {
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

  async function login(phone, password) {
    const normalizedPhone = String(phone ?? "").trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      phone: normalizedPhone,
      password,
    });

    if (error) throw error;

    // The auth listener loads the profile after SIGNED_IN.
    return data;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

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
