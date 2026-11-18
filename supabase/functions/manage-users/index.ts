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

    // Verify the signed-in caller.
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

    // Server-side client: never expose this key to the browser.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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

    const body = await req.json();
    const action = body.action;

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
          email: user.email ?? "",
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
      const rawPhone = String(body.phone ?? "").trim();
      const phoneDigits = rawPhone.replace(/\D/g, "");
      const phone = phoneDigits.length === 10
        ? `+91${phoneDigits}`
        : phoneDigits.length === 12 && phoneDigits.startsWith("91")
          ? `+${phoneDigits}`
          : rawPhone;
      const password = String(body.password ?? "");
      const displayName = String(body.display_name ?? "").trim();
      const role = String(body.role ?? "viewer");

      if (!/^\+91[6-9]\d{9}$/.test(phone)) {
        return jsonResponse(
          { error: "Enter a valid 10-digit Indian mobile number." },
          400
        );
      }

      if (password.length < 12) {
        return jsonResponse(
          { error: "Password must contain at least 12 characters." },
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

      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          phone,
          password,
          phone_confirm: true,
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
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
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