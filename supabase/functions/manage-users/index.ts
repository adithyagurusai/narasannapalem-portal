import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const allowedRoles = ["admin", "viewer"];

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseDevice(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const operating_system =
    /windows/.test(ua) ? "Windows" :
    /android/.test(ua) ? "Android" :
    /(iphone|ipad|ipod)/.test(ua) ? "iOS" :
    /(macintosh|mac os)/.test(ua) ? "macOS" :
    /linux/.test(ua) ? "Linux" : "Unknown";

  const browser =
    /edg\//.test(ua) ? "Microsoft Edge" :
    /opr\//.test(ua) ? "Opera" :
    /firefox\//.test(ua) ? "Firefox" :
    /chrome\//.test(ua) ? "Chrome" :
    /safari\//.test(ua) ? "Safari" : "Unknown";

  const device_type =
    /(iphone|android.*mobile|windows phone)/.test(ua) ? "Phone" :
    /(ipad|tablet)/.test(ua) ? "Tablet" :
    "Computer";

  return {
    operating_system,
    browser,
    device_name: `${operating_system} ${device_type}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Required Supabase environment variables are missing.");
    }

    // Server-side client: never expose this key to the browser.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await req.json();
    const action = body.action;

    // Resolve names only on the server; never return the underlying Auth identifier.
    if (action === "login") {
      const displayName = String(body.display_name ?? "").trim();
      const password = String(body.password ?? "");

      if (!displayName || displayName.length > 100 || !password) {
        return jsonResponse(
          { error: "Enter your full name and password." },
          400
        );
      }

      const { data: profiles, error: resolveError } =
        await supabaseAdmin.rpc("resolve_login_profile", {
          p_display_name: displayName,
        });

      if (resolveError) throw resolveError;

      const profile = profiles?.[0];
      if (!profile || profile.is_active !== true) {
        return jsonResponse(
          { error: "Invalid full name or password." },
          401
        );
      }

      const { data: authUserData, error: authUserError } =
        await supabaseAdmin.auth.admin.getUserById(profile.id);

      if (authUserError) throw authUserError;

      const authUser = authUserData.user;
      if (!authUser) {
        return jsonResponse(
          { error: "Invalid full name or password." },
          401
        );
      }

      const supabasePublic = createClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      let credentials:
        | { email: string; password: string }
        | { phone: string; password: string };
      if (authUser.email) {
        credentials = { email: authUser.email, password };
      } else if (authUser.phone) {
        credentials = { phone: authUser.phone, password };
      } else {
        return jsonResponse(
          { error: "Invalid full name or password." },
          401
        );
      }

      const { data: signInData, error: signInError } =
        await supabasePublic.auth.signInWithPassword(credentials);

      if (signInError || !signInData.session) {
        return jsonResponse(
          { error: "Invalid full name or password." },
          401
        );
      }

      const accessToken = signInData.session.access_token;
      const jwtPayload = decodeJwtPayload(accessToken);
      const sessionId = String(jwtPayload.session_id ?? "");
      const userAgent = String(body.user_agent ?? req.headers.get("user-agent") ?? "").slice(0, 1000);
      const parsedDevice = parseDevice(userAgent);
      const deviceId = String(body.device_id ?? "").slice(0, 100);

      if (!sessionId || !deviceId) {
        await supabasePublic.auth.signOut();
        return jsonResponse(
          { error: "Unable to register this device session. Please try again." },
          500
        );
      }

      const now = new Date();
      const { error: sessionInsertError } = await supabaseAdmin
        .from("user_sessions")
        .upsert({
          session_id: sessionId,
          user_id: profile.id,
          device_id: deviceId,
          device_name: parsedDevice.device_name,
          browser: parsedDevice.browser,
          operating_system: parsedDevice.operating_system,
          user_agent: userAgent,
          created_at: now.toISOString(),
          last_seen_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
          revoked_at: null,
        }, { onConflict: "session_id" });

      if (sessionInsertError) {
        await supabasePublic.auth.signOut();
        throw sessionInsertError;
      }

      return jsonResponse({
        session: {
          access_token: accessToken,
          refresh_token: signInData.session.refresh_token,
        },
      });
    }

    // verify_jwt is disabled so the login action can accept unauthenticated requests.
    // Every other action still verifies the caller and active administrator role here.
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !caller) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }

    const bearerToken = authorization.slice("Bearer ".length);
    const tokenPayload = decodeJwtPayload(bearerToken);
    const currentSessionId = String(tokenPayload.session_id ?? "");

    if (!currentSessionId) {
      return jsonResponse({ error: "Session information is missing. Please sign in again." }, 401);
    }

    const { data: currentSession, error: currentSessionError } =
      await supabaseAdmin
        .from("user_sessions")
        .select("id, user_id, revoked_at, expires_at")
        .eq("session_id", currentSessionId)
        .eq("user_id", caller.id)
        .maybeSingle();

    if (currentSessionError) throw currentSessionError;

    if (
      !currentSession ||
      currentSession.revoked_at ||
      new Date(currentSession.expires_at).getTime() <= Date.now()
    ) {
      return jsonResponse(
        { error: "SESSION_REVOKED", message: "This session is no longer active. Please sign in again." },
        401
      );
    }

    if (action === "heartbeat") {
      const { data: activeProfile, error: activeProfileError } =
        await supabaseAdmin
          .from("profiles")
          .select("is_active")
          .eq("id", caller.id)
          .maybeSingle();

      if (activeProfileError) throw activeProfileError;
      if (!activeProfile?.is_active) {
        return jsonResponse({ error: "ACCOUNT_INACTIVE" }, 403);
      }

      const heartbeatAt = new Date();
      const { error: heartbeatError } = await supabaseAdmin
        .from("user_sessions")
        .update({
          last_seen_at: heartbeatAt.toISOString(),
          expires_at: new Date(heartbeatAt.getTime() + 12 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", currentSession.id)
        .is("revoked_at", null);

      if (heartbeatError) throw heartbeatError;
      return jsonResponse({ session_valid: true });
    }

    if (action === "logout_session") {
      const { error: logoutSessionError } = await supabaseAdmin
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", currentSession.id)
        .is("revoked_at", null);

      if (logoutSessionError) throw logoutSessionError;
      return jsonResponse({ message: "Session ended." });
    }

    // Independently verify that the caller is an active Admin.
    const { data: callerProfile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role, is_active")
        .eq("id", caller.id)
        .single();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.role !== "admin" ||
      callerProfile.is_active !== true
    ) {
      return jsonResponse(
        { error: "Only active administrators can manage users." },
        403
      );
    }

    // LIST DEVICES / SESSIONS FOR ONE USER. This is only called on demand by the UI.
    if (action === "list_sessions") {
      const userId = String(body.user_id ?? "");
      if (!userId) return jsonResponse({ error: "User ID is required." }, 400);

      const { data: sessions, error: sessionsError } = await supabaseAdmin
        .from("user_sessions")
        .select("id, session_id, device_id, device_name, browser, operating_system, created_at, last_seen_at, expires_at, revoked_at")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(50);

      if (sessionsError) throw sessionsError;

      const now = Date.now();
      const results = (sessions ?? []).map((item) => ({
        id: item.id,
        device_name: item.device_name,
        browser: item.browser,
        operating_system: item.operating_system,
        created_at: item.created_at,
        last_seen_at: item.last_seen_at,
        expires_at: item.expires_at,
        revoked_at: item.revoked_at,
        is_current: item.session_id === currentSessionId,
        is_online: !item.revoked_at &&
          new Date(item.expires_at).getTime() > now &&
          now - new Date(item.last_seen_at).getTime() <= 2 * 60 * 1000,
        is_active: !item.revoked_at && new Date(item.expires_at).getTime() > now,
      }));

      return jsonResponse({ sessions: results });
    }

    // REVOKE ONE SESSION. RLS and Edge Function checks enforce the revocation.
    if (action === "revoke_session") {
      const userId = String(body.user_id ?? "");
      const sessionRecordId = String(body.session_record_id ?? "");
      if (!userId || !sessionRecordId) {
        return jsonResponse({ error: "User and session IDs are required." }, 400);
      }

      const { data: revoked, error: revokeError } = await supabaseAdmin
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", sessionRecordId)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();

      if (revokeError) throw revokeError;
      if (!revoked) return jsonResponse({ error: "Session not found or already revoked." }, 404);
      return jsonResponse({ message: "Session revoked successfully." });
    }

    // REVOKE ALL ACTIVE SESSIONS FOR A USER.
    if (action === "revoke_all_sessions") {
      const userId = String(body.user_id ?? "");
      if (!userId) return jsonResponse({ error: "User ID is required." }, 400);

      const { data: revokedRows, error: revokeAllError } = await supabaseAdmin
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");

      if (revokeAllError) throw revokeAllError;
      return jsonResponse({
        message: "All active sessions revoked.",
        revoked_count: revokedRows?.length ?? 0,
      });
    }

    // LIST USERS
    if (action === "list") {
      const allAuthUsers = [];
      let page = 1;
      const perPage = 1000;

      while (true) {
        const { data, error } =
          await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });

        if (error) throw error;

        allAuthUsers.push(...data.users);

        if (data.users.length < perPage) break;
        page++;
      }

      const { data: profiles, error: profilesError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, display_name, role, is_active, created_at");

      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile])
      );

      const users = allAuthUsers.map((user) => {
        const profile = profileMap.get(user.id);

        return {
          id: user.id,
          phone: user.phone ?? "",
          display_name: profile?.display_name ?? "",
          role: profile?.role ?? "viewer",
          is_active: profile?.is_active ?? false,
          created_at: user.created_at,
        };
      });

      return jsonResponse({ users });
    }

    // CREATE USER
    if (action === "create") {
      const password = String(body.password ?? "");
      const displayName = String(body.display_name ?? "").trim();
      const role = String(body.role ?? "viewer");

      if (password.length < 6) {
        return jsonResponse(
          { error: "Password must contain at least 6 characters." },
          400
        );
      }

      if (!displayName || displayName.length > 100) {
        return jsonResponse(
          { error: "Display name is required (maximum 100 characters)." },
          400
        );
      }

      if (!allowedRoles.includes(role)) {
        return jsonResponse(
          { error: "Role must be admin or viewer." },
          400
        );
      }

      const loginEmail =
        `account-${crypto.randomUUID()}@login.narasannapalem.invalid`;
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: {
            display_name: displayName,
          },
        });

      if (createError) throw createError;

      if (!created.user) {
        throw new Error("User creation did not return a user.");
      }

      const { error: insertError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: created.user.id,
          display_name: displayName,
          role,
          is_active: true,
        });

      if (insertError) {
        // Roll back the Auth account if its profile cannot be created.
        const { error: rollbackError } =
          await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        if (rollbackError) {
          console.error("Failed to roll back Auth user:", rollbackError);
        }
        if (insertError.code === "23505") {
          return jsonResponse(
            { error: "An account with this full name already exists." },
            409
          );
        }
        throw insertError;
      }

      return jsonResponse({
        message: "User created successfully.",
        user_id: created.user.id,
      });
    }

    // ASSIGN / MIGRATE A PHONE NUMBER TO AN EXISTING AUTH USER.
    // This preserves the existing user ID, password, profile, role and active status.
    if (action === "set_phone") {
      const userId = String(body.user_id ?? "").trim();
      const rawPhone = String(body.phone ?? "").trim();
      const phoneDigits = rawPhone.replace(/\D/g, "");
      const phone = phoneDigits.length === 10
        ? `+91${phoneDigits}`
        : phoneDigits.length === 12 && phoneDigits.startsWith("91")
          ? `+${phoneDigits}`
          : rawPhone;

      if (!userId) {
        return jsonResponse({ error: "User ID is required." }, 400);
      }
      if (!/^\+91[6-9]\d{9}$/.test(phone)) {
        return jsonResponse(
          { error: "Enter a valid 10-digit Indian mobile number." },
          400
        );
      }

      const { data: updated, error: phoneError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          phone,
          phone_confirm: true,
        });
      if (phoneError) throw phoneError;

      return jsonResponse({
        message: "Mobile number assigned successfully. Existing password and role are unchanged.",
        user_id: updated.user?.id ?? userId,
        phone: updated.user?.phone ?? phone,
      });
    }

    // UPDATE USER
    if (action === "update") {
      const userId = String(body.user_id ?? "");
      const updates: {
        role?: string;
        is_active?: boolean;
      } = {};

      if (!userId) {
        return jsonResponse({ error: "User ID is required." }, 400);
      }

      if (userId === caller.id) {
        return jsonResponse(
          { error: "You cannot change your own role or account status." },
          400
        );
      }

      if (body.role !== undefined) {
        const role = String(body.role);

        if (!allowedRoles.includes(role)) {
          return jsonResponse(
            { error: "Role must be admin or viewer." },
            400
          );
        }

        updates.role = role;
      }

      if (body.is_active !== undefined) {
        if (typeof body.is_active !== "boolean") {
          return jsonResponse(
            { error: "is_active must be true or false." },
            400
          );
        }

        updates.is_active = body.is_active;
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No changes provided." }, 400);
      }

      const { data: targetProfile, error: targetError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, role, is_active")
          .eq("id", userId)
          .single();

      if (targetError || !targetProfile) {
        return jsonResponse({ error: "User profile not found." }, 404);
      }

      const removingActiveAdmin =
        targetProfile.role === "admin" &&
        targetProfile.is_active === true &&
        (updates.role === "viewer" || updates.is_active === false);

      if (removingActiveAdmin) {
        const { count, error: countError } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);

        if (countError) throw countError;

        if ((count ?? 0) <= 1) {
          return jsonResponse(
            { error: "You cannot deactivate or demote the last active Admin." },
            400
          );
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", userId);

      if (updateError) throw updateError;

      if (updates.is_active === false || updates.role !== undefined) {
        const { error: revokeSessionsError } = await supabaseAdmin
          .from("user_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .is("revoked_at", null);

        if (revokeSessionsError) throw revokeSessionsError;
      }

      return jsonResponse({ message: "User updated successfully." });
    }

    return jsonResponse({ error: "Invalid action." }, 400);
  } catch (error) {
    console.error("manage-users error:", error);

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error." },
      500
    );
  }
});