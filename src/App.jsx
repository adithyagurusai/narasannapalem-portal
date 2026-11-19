import { lazy, Suspense, useState } from "react";

import {
  LayoutDashboard,
  Users,
  UsersRound,
  Map,
  ShieldCheck,
  Menu,
  UserRound,
  X,
  LogOut,
} from "lucide-react";

import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";

// Load page bundles only when a user opens them. This keeps the initial
// authenticated shell small and avoids loading Recharts on non-dashboard pages.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Voters = lazy(() => import("./pages/Voters"));
const Wards = lazy(() => import("./pages/Wards"));
const Groups = lazy(() => import("./pages/Groups"));
const UsersPage = lazy(() => import("./pages/Users"));

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "groups", label: "Community Groups", icon: UsersRound },
  { id: "voters", label: "Voters", icon: Users },
  { id: "wards", label: "Wards", icon: Map },
  { id: "users", label: "User Management", icon: ShieldCheck, adminOnly: true },
];

const pageDetails = {
  dashboard: { title: "Dashboard", description: "Overview of Narasannapalem" },
  groups: { title: "Community Groups", description: "Browse community-wise voter memberships" },
  voters: { title: "Voters", description: "Search voter information" },
  wards: { title: "Wards", description: "Voter distribution across all wards" },
  users: { title: "User Management", description: "Manage authorized portal users" },
};

const pageComponents = {
  dashboard: Dashboard,
  groups: Groups,
  voters: Voters,
  wards: Wards,
  users: UsersPage,
};

function PortalApp() {
  const { session, profile, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-600">Loading your portal...</p>
      </div>
    );
  }

  if (!session || !profile || !profile.is_active) {
    return <Login />;
  }

  const visibleNavigation = navigation.filter(
    (item) => !item.adminOnly || profile.role === "admin"
  );
  const safeActivePage =
    activePage === "users" && profile.role !== "admin" ? "dashboard" : activePage;
  const ActivePage = pageComponents[safeActivePage] || Dashboard;
  const currentPage = pageDetails[safeActivePage] || pageDetails.dashboard;
  const displayName = profile.display_name || "Portal User";
  const roleLabel = profile.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";

  function navigateTo(page) {
    if (page === "users" && profile.role !== "admin") return;
    setActivePage(page);
    setSidebarOpen(false);
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await logout();
      setActivePage("dashboard");
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert("Unable to log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#10233F] text-white transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500">
              <ShieldCheck size={23} />
            </div>
            <div>
              <h1 className="font-semibold tracking-wide">Narasannapalem</h1>
              <p className="text-xs text-slate-400">Voter Portal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-8">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[2px] text-slate-500">
            Main Menu
          </p>
          <nav className="space-y-1">
            {visibleNavigation.map(({ id, label, icon: Icon }) => {
              const isActive = safeActivePage === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigateTo(id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
              <UserRound size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="text-xs text-slate-400">{roleLabel} Account</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{currentPage.title}</h2>
              <p className="hidden text-xs text-slate-500 sm:block">{currentPage.description}</p>
            </div>
          </div>
        </header>

        <div className="min-h-[calc(100vh-144px)] p-4 sm:p-5 md:p-8">
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center">
                <p className="text-sm font-medium text-slate-500">Loading page...</p>
              </div>
            }
          >
            <ActivePage />
          </Suspense>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs text-slate-500">
          Narasannapalem Voter Portal <span className="mx-2">·</span> Electoral Roll 2026
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortalApp />
    </AuthProvider>
  );
}
