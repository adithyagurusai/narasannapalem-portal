
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  UserPlus,
  Users as UsersIcon,
  ShieldCheck,
  Eye,
  RefreshCw,
  Power,
  X,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const ROLES = ["admin", "viewer"];

function getErrorMessage(error) {
  if (error?.context && typeof error.context.json === "function") {
    return error.context
      .json()
      .then((body) => body?.error || error.message)
      .catch(() => error.message || "Something went wrong.");
  }

  return Promise.resolve(error?.message || "Something went wrong.");
}

function formatDate(date) {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    display_name: "",
    password: "",
    role: "viewer",
  });

  const invokeFunction = async (body) => {
    const { data, error: functionError } =
      await supabase.functions.invoke("manage-users", { body });

    if (functionError) {
      throw new Error(await getErrorMessage(functionError));
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await invokeFunction({ action: "list" });
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      // This ID is used only to label the signed-in account in the UI.
      // Read the cached session locally; the manage-users Edge Function
      // independently verifies the caller and active administrator role.
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      setCurrentUserId(data.session?.user?.id || null);
      await loadUsers();
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [loadUsers]);

  const handleCreate = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await invokeFunction({
        action: "create",
        display_name: form.display_name,
        password: form.password,
        role: form.role,
      });

      setSuccess("User account created successfully.");

      setForm({
        display_name: "",
        password: "",
        role: "viewer",
      });

      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to create user.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (userId, updates) => {
    setUpdatingId(userId);
    setError("");
    setSuccess("");

    try {
      await invokeFunction({
        action: "update",
        user_id: userId,
        ...updates,
      });

      setSuccess("User account updated successfully.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to update user.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    const searchText = search.toLowerCase();

    return (
      user.display_name?.toLowerCase().includes(searchText) ||
      user.phone?.toLowerCase().includes(searchText) ||
      user.role?.toLowerCase().includes(searchText)
    );
  });

  const activeCount = users.filter((user) => user.is_active).length;
  const adminCount = users.filter(
    (user) => user.role === "admin"
  ).length;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage full-name-based portal accounts.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <UserPlus size={18} />
          Add User
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-auto"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <span>{success}</span>
          <button
            onClick={() => setSuccess("")}
            aria-label="Dismiss success"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Accounts"
          value={users.length}
          icon={<UsersIcon size={21} />}
        />
        <StatCard
          label="Active Accounts"
          value={activeCount}
          icon={<Eye size={21} />}
        />
        <StatCard
          label="Administrators"
          value={adminCount}
          icon={<ShieldCheck size={21} />}
        />
      </div>

      {/* User directory */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Registered Users
            </h2>
            <p className="text-xs text-slate-500">
              {filteredUsers.length} account(s) displayed
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              onClick={loadUsers}
              disabled={loading}
              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Refresh users"
            >
              <RefreshCw
                size={18}
                className={loading ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle size={20} className="animate-spin" />
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isUpdating = updatingId === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {user.display_name || "Unnamed user"}
                          {isSelf && (
                            <span className="ml-2 text-xs text-blue-600">
                              You
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {user.phone || "Mobile number not assigned"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={user.role}
                          disabled={isSelf || isUpdating || !user.is_active}
                          onChange={(e) =>
                            handleUpdate(user.id, {
                              role: e.target.value,
                            })
                          }
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            user.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-500">
                        {formatDate(user.created_at)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={async () => {
                            const entered = window.prompt(
                              `Enter the 10-digit Indian mobile number for ${user.display_name || "this account"}:`,
                              user.phone?.replace(/^\+91/, "") || ""
                            );
                            if (entered === null) return;
                            setUpdatingId(user.id);
                            setError("");
                            setSuccess("");
                            try {
                              await invokeFunction({
                                action: "set_phone",
                                user_id: user.id,
                                phone: entered,
                              });
                              setSuccess("Mobile number assigned. Existing password and role were preserved.");
                              await loadUsers();
                            } catch (err) {
                              setError(err.message || "Unable to assign mobile number.");
                            } finally {
                              setUpdatingId(null);
                            }
                          }}
                          className="mr-2 inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                        >
                          {user.phone ? "Change mobile" : "Set mobile"}
                        </button>
                        <button
                          disabled={isSelf || isUpdating}
                          onClick={() =>
                            handleUpdate(user.id, {
                              is_active: !user.is_active,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                            user.is_active
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {isUpdating ? (
                            <LoaderCircle
                              size={15}
                              className="animate-spin"
                            />
                          ) : (
                            <Power size={15} />
                          )}
                          {user.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create user modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowCreate(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Create User
                </h2>
                <p className="text-sm text-slate-500">
                  Add a new portal account.
                </p>
              </div>

              <button
                onClick={() => setShowCreate(false)}
                disabled={saving}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Full Name">
                <input
                  required
                  maxLength={100}
                  value={form.display_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      display_name: e.target.value,
                    })
                  }
                  placeholder="Enter full name"
                  className="form-input"
                />
              </FormField>

              <FormField label="Temporary Password">
                <input
                  required
                  type="password"
                  minLength={6}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="At least 6 characters"
                  className="form-input"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Share this password securely with the new user.
                </p>
              </FormField>

              <FormField label="Account Role">
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value })
                  }
                  className="form-input"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </FormField>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving && (
                    <LoaderCircle size={17} className="animate-spin" />
                  )}
                  {saving ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
