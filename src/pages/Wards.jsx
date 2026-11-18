
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  MapPin,
  Users,
  UserRound,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";

const PAGE_SIZE = 20;

const WARD_NAMES = Array.from(
  { length: 10 },
  (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`
);

export default function Wards() {
  const { profile } = useAuth();
  const canExport = profile?.role === "admin";
  const voterRecordsRef = useRef(null);

  const [wardStats, setWardStats] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");

  const [selectedWard, setSelectedWard] = useState("");
  const [voters, setVoters] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [loadingVoters, setLoadingVoters] = useState(false);
  const [voterError, setVoterError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Automatically scroll to voter records after selecting a ward.
  useEffect(() => {
    if (selectedWard && voterRecordsRef.current) {
      voterRecordsRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedWard]);

  // Load aggregated ward statistics from PostgreSQL.
  useEffect(() => {
    let cancelled = false;

    async function loadWardStats() {
      setLoadingStats(true);
      setStatsError("");

      try {
        const { data, error } = await supabase.rpc("get_ward_stats");
        if (error) throw error;

        const byWard = new Map(
          (data || []).map((row) => [
            `Ward ${String(row.ward_number).padStart(2, "0")}`,
            {
              total: Number(row.total_voters || 0),
              male: Number(row.male_voters || 0),
              female: Number(row.female_voters || 0),
            },
          ])
        );

        if (!cancelled) {
          setWardStats(
            WARD_NAMES.map((ward) => ({
              ward,
              ...(byWard.get(ward) || { total: 0, male: 0, female: 0 }),
            }))
          );
        }
      } catch (err) {
        console.error("Ward statistics error:", err);
        if (!cancelled) {
          setStatsError(err.message || "Unable to load ward statistics.");
        }
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    }

    loadWardStats();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load voters for the selected ward.
  useEffect(() => {
    if (!selectedWard) return;

    let cancelled = false;

    async function loadWardVoters() {
      setLoadingVoters(true);
      setVoterError("");

      try {
        let query = supabase
          .from("voters")
          .select(
            `
              voter_id,
              telugu_name,
              english_name,
              age,
              gender,
              ward_number,
              house_number,
              relationship_type,
              relative_name,
              panchayat_serial_number,
              relative_name_english
            `
          )
          .eq("ward_number", selectedWard);

        const searchTerm = search.trim().replace(/[,%()]/g, "");

        // Search only by V.Sno, English voter name, or Voter ID.
        // V.Sno is exact; name and Voter ID use partial matching.
        if (searchTerm) {
          const conditions = [
            `english_name.ilike.%${searchTerm}%`,
            `voter_id.ilike.%${searchTerm}%`,
          ];

          if (/^\d+$/.test(searchTerm)) {
            conditions.push(`panchayat_serial_number.eq.${Number(searchTerm)}`);
          }

          query = query.or(conditions.join(","));
        }

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE;

        const { data, error } = await query
          .order("voter_id", { ascending: true })
          .range(from, to);

        if (error) throw error;

        if (!cancelled) {
          const rows = data || [];
          setHasNextPage(rows.length > PAGE_SIZE);
          setVoters(rows.slice(0, PAGE_SIZE));
        }
      } catch (err) {
        console.error("Ward voter loading error:", err);

        if (!cancelled) {
          setVoterError(
            err.message || "Unable to load voters."
          );
          setVoters([]);
          setHasNextPage(false);
        }
      } finally {
        if (!cancelled) setLoadingVoters(false);
      }
    }

    loadWardVoters();

    return () => {
      cancelled = true;
    };
  }, [selectedWard, search, page]);

  const totalVoters = wardStats.reduce(
    (sum, ward) => sum + ward.total,
    0
  );

  const totalMale = wardStats.reduce(
    (sum, ward) => sum + ward.male,
    0
  );

  const totalFemale = wardStats.reduce(
    (sum, ward) => sum + ward.female,
    0
  );

  function selectWard(ward) {
    setSelectedWard(ward);
    setSearch("");
    setPage(0);
  }

  function closeWard() {
    setSelectedWard("");
    setSearch("");
    setPage(0);
    setVoters([]);
  }

  function escapeCsv(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  // Export all matching voters from the selected ward.
  async function exportWardCsv() {
    if (!canExport || !selectedWard || exporting) return;

    setExporting(true);

    try {
      let query = supabase
        .from("voters")
        .select(`
          voter_id,
          telugu_name,
          english_name,
          age,
          gender,
          ward_number,
          house_number,
          relationship_type,
          relative_name,
          panchayat_serial_number,
          relative_name_english
        `)
        .eq("ward_number", selectedWard);

      const searchTerm = search.trim().replace(/[,%()]/g, "");

      // Search only by V.Sno, English voter name, or Voter ID.
      // V.Sno is exact; name and Voter ID use partial matching.
      if (searchTerm) {
        const conditions = [
          `english_name.ilike.%${searchTerm}%`,
          `voter_id.ilike.%${searchTerm}%`,
        ];

        if (/^\d+$/.test(searchTerm)) {
          conditions.push(`panchayat_serial_number.eq.${Number(searchTerm)}`);
        }

        query = query.or(conditions.join(","));
      }

      let allRows = [];

      for (let from = 0; ; from += 1000) {
        const { data, error } = await query
          .order("voter_id", { ascending: true })
          .range(from, from + 999);

        if (error) throw error;

        allRows = allRows.concat(data || []);

        if (!data || data.length < 1000) break;
      }

      const headers = [
        "V.Sno",
        "Voter ID",
        "English Name",
        "Telugu Name",
        "English Relative Name",
        "Telugu Relative Name",
        "Age",
        "Gender",
        "Ward",
        "House Number",
        "Relationship",
      ];

      const rows = allRows.map((voter) => [
        voter.panchayat_serial_number,
        voter.voter_id,
        voter.english_name,
        voter.telugu_name,
        voter.relative_name_english,
        voter.relative_name,
        voter.age,
        voter.gender,
        voter.ward_number,
        voter.house_number,
        voter.relationship_type,
      ]);

      const csv = [
        headers.map(escapeCsv).join(","),
        ...rows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\n");

      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${selectedWard.replace(" ", "_")}_voters.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Ward CSV export error:", err);
      setVoterError(
        err.message || "Unable to export ward records."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* Overall statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Users size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total voters</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingStats ? "..." : totalVoters.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <UserRound size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Male voters</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingStats ? "..." : totalMale.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-pink-50 p-3 text-pink-600">
              <UserRound size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Female voters</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingStats ? "..." : totalFemale.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ward cards */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">All wards</h3>
            <p className="mt-1 text-xs text-slate-500">
              Select a ward to view its voter records.
            </p>
          </div>
          <span className="text-xs text-slate-500">10 wards</span>
        </div>

        {statsError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {statsError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {wardStats.map((item) => (
            <button
              key={item.ward}
              type="button"
              onClick={() => selectWard(item.ward)}
              className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${
                selectedWard === item.ward
                  ? "border-blue-500 ring-2 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                  <MapPin size={21} />
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {item.ward}
                </span>
              </div>

              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                {item.ward}
              </h3>

              <p className="mt-1 text-2xl font-bold text-blue-700">
                {loadingStats ? "..." : item.total.toLocaleString("en-IN")}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  voters
                </span>
              </p>

              <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>Male: {loadingStats ? "..." : item.male}</span>
                <span>Female: {loadingStats ? "..." : item.female}</span>
              </div>

              <p className="mt-4 text-xs font-medium text-blue-600">
                View voter records →
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Selected ward voter records */}
      {selectedWard && (
        <div
          ref={voterRecordsRef}
          className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h3 className="font-semibold text-slate-900">
                {selectedWard} — Voter Records
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {voters.length} record{voters.length === 1 ? "" : "s"} on this page
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canExport && (
                <button
                  type="button"
                  onClick={exportWardCsv}
                  disabled={exporting || loadingVoters || voters.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Download size={15} />
                  {exporting ? "Exporting..." : "Export CSV"}
                </button>
              )}

              <button
                type="button"
                onClick={closeWard}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <X size={15} />
                Close
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Search V.Sno, voter name or Voter ID..."
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {voterError && (
            <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {voterError}
            </div>
          )}

          {/* Voter table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[0] text-left md:min-w-[850px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">V.Sno</th>
                  <th className="px-5 py-4 font-semibold">Voter ID</th>
                  <th className="px-5 py-4 font-semibold">Name</th>
                  <th className="hidden px-5 py-4 font-semibold md:table-cell">Relative</th>
                  <th className="hidden px-5 py-4 font-semibold md:table-cell">Age</th>
                  <th className="hidden px-5 py-4 font-semibold md:table-cell">Gender</th>
                  <th className="hidden px-5 py-4 font-semibold md:table-cell">House No.</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loadingVoters ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-500">
                      Loading voter records...
                    </td>
                  </tr>
                ) : voters.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-500">
                      No voter records found.
                    </td>
                  </tr>
                ) : (
                  voters.map((voter) => (
                    <tr key={voter.voter_id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                        {voter.panchayat_serial_number ?? "—"}
                      </td>

                      <td className="break-all px-2 py-3 font-mono text-[10px] font-medium text-blue-700 sm:px-3 sm:text-xs md:px-5 md:py-4 md:text-sm">
                        {voter.voter_id}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-900">
                          {voter.english_name || "—"}
                        </p>
                        {voter.telugu_name && (
                          <p className="mt-1 text-xs text-slate-500">
                            {voter.telugu_name}
                          </p>
                        )}
                      </td>

                      <td className="hidden px-5 py-4 md:table-cell">
                        <p className="text-sm text-slate-800">
                          {voter.relative_name_english || "—"}
                        </p>
                        {voter.relative_name && (
                          <p className="mt-1 text-xs text-slate-500">
                            {voter.relative_name}
                          </p>
                        )}
                      </td>

                      <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                        {voter.age ?? "—"}
                      </td>

                      <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                        {voter.gender || "—"}
                      </td>

                      <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                        {voter.house_number || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <p className="text-xs text-slate-500">
              Page {page + 1}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0 || loadingVoters}
                onClick={() =>
                  setPage((previous) => Math.max(0, previous - 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <button
                type="button"
                disabled={!hasNextPage || loadingVoters}
                onClick={() => setPage((previous) => previous + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
