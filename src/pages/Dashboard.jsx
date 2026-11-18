import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserRound,
  UserRoundCheck,
  MapPin,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "../lib/supabase.js";

const initialStats = { total: 0, male: 0, female: 0, wards: 10 };

export default function Dashboard() {
  const [stats, setStats] = useState(initialStats);
  const [wardData, setWardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase.rpc("get_dashboard_stats");
      if (queryError) throw queryError;
      if (!data?.length) throw new Error("No dashboard statistics were returned.");

      const first = data[0];
      setStats({
        total: Number(first.total_voters),
        male: Number(first.male_voters),
        female: Number(first.female_voters),
        wards: 10,
      });
      setWardData(
        data.map((row) => ({
          ward: `Ward ${String(row.ward_number).padStart(2, "0")}`,
          voters: Number(row.ward_voters),
        }))
      );
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(err.message || "Unable to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const statCards = [
    { label: "Total Voters", value: stats.total.toLocaleString("en-IN"), note: "Total electoral records", icon: Users },
    { label: "Male Voters", value: stats.male.toLocaleString("en-IN"), note: "Male voter records", icon: UserRound },
    { label: "Female Voters", value: stats.female.toLocaleString("en-IN"), note: "Female voter records", icon: UserRoundCheck },
    { label: "Total Wards", value: stats.wards, note: "Electoral roll wards", icon: MapPin },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={loadDashboardData}
          disabled={loading}
          title="Refresh dashboard"
          aria-label="Refresh dashboard"
          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Unable to load dashboard statistics</p>
          <p className="mt-1">{error}</p>
          <button type="button" onClick={loadDashboardData} className="mt-3 font-medium underline">
            Try again
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Icon size={20} /></div>
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
              {loading ? "—" : value}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {loading ? "Loading statistics..." : note}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Ward-wise distribution</h3>
              <p className="mt-1 text-xs text-slate-500">Voter count by ward</p>
            </div>
            <MoreHorizontal className="text-slate-400" size={20} />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wardData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="ward" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="voters" name="Voters" fill="#2563EB" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-semibold text-slate-900">Portal information</h3>
          <p className="mt-1 text-xs text-slate-500">Current configuration</p>
          <div className="mt-6 space-y-5">
            {[
              ["Panchayat", "Narasannapalem"],
              ["Mandal", "Lingapalem"],
              ["District", "Eluru"],
              ["Electoral year", "2026"],
              ["Wards", "10"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-right text-sm font-medium text-slate-800">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
