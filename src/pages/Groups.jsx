import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Layers3,
  RefreshCw,
  Search,
  UserRound,
  UserX,
  Users,
  UsersRound,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";

const PAGE_SIZE = 20;
const PAGE_CHUNK_SIZE = 1000;
const WARD_OPTIONS = Array.from(
  { length: 10 },
  (_, index) => `Ward ${String(index + 1).padStart(2, "0")}`
);

async function fetchAllPages(makeQuery) {
  const rows = [];

  for (let from = 0; ; from += PAGE_CHUNK_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_CHUNK_SIZE - 1);
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_CHUNK_SIZE) break;
  }

  return rows;
}

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [totalVoters, setTotalVoters] = useState(0);
  const [uniqueGroupedVoters, setUniqueGroupedVoters] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [page, setPage] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [recordsReloadKey, setRecordsReloadKey] = useState(0);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");

    try {
      const [
        { data: groupRows, error: groupError },
        { count, error: voterCountError },
        memberRows,
      ] = await Promise.all([
        supabase.from("voter_groups").select("id, name, source_file").order("name"),
        supabase.from("voters").select("voter_id", { count: "exact", head: true }),
        fetchAllPages(() =>
          supabase
            .from("voter_group_members")
            .select("group_id, voter_id")
            .order("voter_id")
        ),
      ]);

      if (groupError) throw groupError;
      if (voterCountError) throw voterCountError;

      // One membership scan replaces one count request per group.
      const memberCounts = new Map();
      const uniqueVoterIds = new Set();

      for (const membership of memberRows) {
        memberCounts.set(
          membership.group_id,
          (memberCounts.get(membership.group_id) || 0) + 1
        );
        if (membership.voter_id) uniqueVoterIds.add(membership.voter_id);
      }

      setGroups(
        (groupRows || []).map((group) => ({
          ...group,
          member_count: memberCounts.get(group.id) || 0,
        }))
      );
      setTotalVoters(count || 0);
      setUniqueGroupedVoters(uniqueVoterIds.size);
    } catch (error) {
      console.error("Community group overview error:", error);
      setOverviewError(error.message || "Unable to load community groups.");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Search, ward filtering, ordering and pagination run in PostgreSQL.
  // Only the current 20-row page is transferred to the browser.
  useEffect(() => {
    if (!selectedGroup && !showUnassigned) return undefined;

    let cancelled = false;
    setRecordsLoading(true);
    setRecordsError("");

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc(
          "get_community_group_voters",
          {
            p_group_id: selectedGroup?.id ? String(selectedGroup.id) : null,
            p_unassigned: showUnassigned,
            p_search: search.trim() || null,
            p_ward: selectedWard || null,
            p_page: page,
            p_page_size: PAGE_SIZE,
          }
        );

        if (error) throw error;

        if (!cancelled) {
          setRecords(Array.isArray(data?.rows) ? data.rows : []);
          setTotalCount(Number(data?.total_count || 0));
        }
      } catch (error) {
        console.error("Community group voter loading error:", error);
        if (!cancelled) {
          setRecordsError(
            error.message ||
              "Unable to load voter records. Apply the performance SQL migration and try again."
          );
          setRecords([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    selectedGroup?.id,
    showUnassigned,
    search,
    selectedWard,
    page,
    recordsReloadKey,
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const visibleRecords = records;
  const unassignedCount = Math.max(0, totalVoters - uniqueGroupedVoters);

  function openGroup(group) {
    setSearch("");
    setSelectedWard("");
    setPage(0);
    setShowUnassigned(false);
    setSelectedGroup(group);
  }

  function openUnassigned() {
    setSearch("");
    setSelectedWard("");
    setPage(0);
    setSelectedGroup(null);
    setShowUnassigned(true);
  }

  function goBack() {
    setSelectedGroup(null);
    setShowUnassigned(false);
    setSearch("");
    setSelectedWard("");
    setPage(0);
    setRecords([]);
    setTotalCount(0);
    setRecordsError("");
  }

  const viewTitle = showUnassigned
    ? "Unassigned voters"
    : selectedGroup?.name || "Community Groups";

  if (selectedGroup || showUnassigned) {
    return (
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={goBack}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              <ArrowLeft size={16} /> All groups
            </button>
            <h2 className="text-xl font-semibold text-slate-900">{viewTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {recordsLoading
                ? "Loading voter records..."
                : `${totalCount.toLocaleString("en-IN")} matching voters`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRecordsReloadKey((current) => current + 1)}
            disabled={recordsLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={recordsLoading ? "animate-spin" : ""} />
            Refresh view
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-slate-400" />
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

            <div>
              <select
                id="community-ward-filter"
                value={selectedWard}
                onChange={(event) => {
                  setSelectedWard(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">All wards</option>
                {WARD_OPTIONS.map((ward) => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>
            </div>
          </div>

          {(search || selectedWard) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {totalCount.toLocaleString("en-IN")} voters match the selected filters
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedWard("");
                  setPage(0);
                }}
                className="text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {recordsError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {recordsError}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Voter records</h3>
            <p className="mt-1 text-xs text-slate-500">
              Sorted by ascending V.Sno, with Voter ID as the tie-breaker.
            </p>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {recordsLoading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">Loading voters...</p>
            ) : visibleRecords.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">No voters found.</p>
            ) : (
              visibleRecords.map((voter) => (
                <article key={voter.voter_id} className="flex items-center gap-3 px-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
                    {voter.panchayat_serial_number ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{voter.english_name || "—"}</p>
                    {voter.telugu_name && <p className="mt-0.5 truncate text-xs text-slate-500">{voter.telugu_name}</p>}
                    <p className="mt-1 font-mono text-xs text-blue-700">{voter.voter_id}</p>
                    <p className="mt-1 text-xs text-slate-500">{voter.ward_number || "Ward unavailable"}</p>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">V.Sno</th>
                  <th className="px-5 py-4 font-semibold">Voter ID</th>
                  <th className="px-5 py-4 font-semibold">Name</th>
                  <th className="px-5 py-4 font-semibold">Relative</th>
                  <th className="px-5 py-4 font-semibold">Age / Gender</th>
                  <th className="px-5 py-4 font-semibold">Ward</th>
                  <th className="px-5 py-4 font-semibold">House No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recordsLoading ? (
                  <tr><td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-500">Loading voter records...</td></tr>
                ) : visibleRecords.length === 0 ? (
                  <tr><td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-500">No voters found.</td></tr>
                ) : (
                  visibleRecords.map((voter) => (
                    <tr key={voter.voter_id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700">{voter.panchayat_serial_number ?? "—"}</td>
                      <td className="px-5 py-4 font-mono text-sm font-medium text-blue-700">{voter.voter_id}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-900">{voter.english_name || "—"}</p>
                        {voter.telugu_name && <p className="mt-1 text-xs text-slate-500">{voter.telugu_name}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-slate-800">{voter.relative_name_english || "—"}</p>
                        {voter.relative_name && <p className="mt-1 text-xs text-slate-500">{voter.relative_name}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{voter.age ?? "—"} / {voter.gender || "—"}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{voter.ward_number || "—"}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{voter.house_number || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <p className="text-xs text-slate-500">
              Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0 || recordsLoading}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages || recordsLoading}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Community Groups</h2>
          <p className="mt-1 text-sm text-slate-500">
            Browse voters using the eight imported community lists.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          disabled={overviewLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={overviewLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {overviewError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Unable to load community groups</p>
          <p className="mt-1">{overviewError}</p>
          <p className="mt-2 text-xs">
            Confirm that the signed-in role has SELECT access to voter_groups and voter_group_members.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total voters", value: totalVoters, icon: Users },
          { label: "Unique grouped voters", value: uniqueGroupedVoters, icon: UsersRound },
          { label: "Unassigned voters", value: unassignedCount, icon: UserX },
          { label: "Group lists", value: groups.length, icon: Layers3 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Icon size={19} /></span>
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">
              {overviewLoading ? "—" : value.toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Imported groups</h3>
          <p className="mt-1 text-xs text-slate-500">Select a group to view its voter list.</p>
        </div>

        {overviewLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
            Loading group information...
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
            No groups are available.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => openGroup(group)}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-blue-50 p-3 text-blue-600"><UsersRound size={21} /></span>
                  <span className="text-xs text-slate-400">Community list</span>
                </div>
                <h4 className="mt-5 text-lg font-semibold text-slate-900">{group.name}</h4>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {group.member_count.toLocaleString("en-IN")}
                  <span className="ml-2 text-sm font-normal text-slate-500">members</span>
                </p>
                <p className="mt-4 text-xs font-medium text-blue-600">View voter records →</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openUnassigned}
        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left transition hover:border-amber-300 hover:bg-amber-100/70"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white p-3 text-amber-700"><UserRound size={21} /></span>
          <div>
            <h3 className="font-semibold text-slate-900">Unassigned voters</h3>
            <p className="mt-1 text-xs text-slate-600">Voters who do not appear in any of the eight imported lists.</p>
          </div>
        </div>
        <span className="text-lg font-bold text-amber-800">
          {overviewLoading ? "—" : unassignedCount.toLocaleString("en-IN")}
        </span>
      </button>

      <p className="text-xs leading-5 text-slate-500">
        A voter can belong to more than one group. Group totals are memberships, so their sum can be higher than the number of unique grouped voters.
      </p>
    </section>
  );
}
