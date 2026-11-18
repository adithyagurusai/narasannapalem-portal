
import { useEffect, useState } from "react";

import {
  Search,
  Filter,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  UserRound,
  MapPin,
  Calendar,
  Home,
  RefreshCw,
  Eye,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";

const PAGE_SIZE = 20;

const initialFilters = {
  ward: "",
  gender: "",
  minAge: "",
  maxAge: "",
};

export default function Voters() {
  const [voters, setVoters] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);

  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedVoter, setSelectedVoter] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  const [showFilters, setShowFilters] = useState(false);

  // Fetch voter records from Supabase.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

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
              photo_path,
              panchayat_serial_number,
              relative_name_english
            `
          );

        // Search only the approved fields: English names, Voter ID and V.Sno.
        const searchTerm = search.trim().replace(/[,%()]/g, "");

        // Search only by V.Sno, English voter name, or Voter ID.
        // V.Sno is an exact numeric match; name and Voter ID are partial matches.
        if (searchTerm) {
          const conditions = [
            `english_name.ilike.%${searchTerm}%`,
            `voter_id.ilike.%${searchTerm}%`,
          ];

          if (/^\d+$/.test(searchTerm)) {
            conditions.push(
              `panchayat_serial_number.eq.${Number(searchTerm)}`
            );
          }

          query = query.or(conditions.join(","));
        }

        // Ward filter.
        if (filters.ward) {
          query = query.eq(
            "ward_number",
            `Ward ${String(filters.ward).padStart(2, "0")}`
          );
        }

        // Gender filter.
        if (filters.gender) {
          query = query.ilike("gender", filters.gender);
        }

        // Age filters.
        if (filters.minAge !== "") {
          query = query.gte("age", Number(filters.minAge));
        }

        if (filters.maxAge !== "") {
          query = query.lte("age", Number(filters.maxAge));
        }

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE;

        const { data, error: queryError } = await query
          .order("voter_id", { ascending: true })
          .range(from, to);

        if (queryError) throw queryError;

        if (!cancelled) {
          const rows = data || [];
          setHasNextPage(rows.length > PAGE_SIZE);
          setVoters(rows.slice(0, PAGE_SIZE));
        }
      } catch (err) {
        console.error("Voter directory error:", err);

        if (!cancelled) {
          setError(err.message || "Unable to load voter records.");
          setVoters([]);
          setHasNextPage(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filters, page]);

  function updateFilter(key, value) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
    }));

    setPage(0);
  }

  function clearFilters() {
    setFilters(initialFilters);
    setSearch("");
    setPage(0);
  }

  // Open an individual voter profile.
  async function openVoter(voter) {
    setSelectedVoter(voter);
    setPhotoUrl("");
    setProfileLoading(true);

    try {
      if (voter.photo_path) {
        const { data, error: photoError } = await supabase.storage
          .from("voter-photos")
          .createSignedUrl(voter.photo_path, 3600);

        if (photoError) throw photoError;

        setPhotoUrl(data?.signedUrl || "");
      }
    } catch (err) {
      console.error("Voter photo loading error:", err);
    } finally {
      setProfileLoading(false);
    }
  }

  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== ""
  ).length;

  return (
    <section className="space-y-6">

      {/* Search and filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={19}
            />

            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search V.Sno, voter name or Voter ID..."
              className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium hover:bg-slate-50"
          >
            <Filter size={17} />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Reset
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-600">
                Ward
              </label>

              <select
                value={filters.ward}
                onChange={(e) => updateFilter("ward", e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">All wards</option>

                {Array.from({ length: 10 }, (_, i) => {
                  const ward = String(i + 1).padStart(2, "0");

                  return (
                    <option key={ward} value={ward}>
                      Ward {ward}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-600">
                Gender
              </label>

              <select
                value={filters.gender}
                onChange={(e) => updateFilter("gender", e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">All genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-600">
                Minimum age
              </label>

              <input
                type="number"
                min="18"
                max="120"
                value={filters.minAge}
                onChange={(e) => updateFilter("minAge", e.target.value)}
                placeholder="Minimum age"
                className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-600">
                Maximum age
              </label>

              <input
                type="number"
                min="18"
                max="120"
                value={filters.maxAge}
                onChange={(e) => updateFilter("maxAge", e.target.value)}
                placeholder="Maximum age"
                className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Unable to load voters</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Voter table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              Electoral records
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {loading
                ? "Retrieving records..."
                : `Showing ${voters.length} record${voters.length === 1 ? "" : "s"} on this page`}
            </p>
          </div>

          <Users className="text-slate-400" size={21} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[0] table-fixed text-left md:min-w-[950px] md:table-auto">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[56px] px-2 py-3 text-xs font-semibold sm:px-3 md:w-auto md:px-5 md:py-4">V.Sno</th>
                <th className="w-[104px] px-2 py-3 text-xs font-semibold sm:px-3 md:w-auto md:px-5 md:py-4">Voter ID</th>
                <th className="px-2 py-3 text-xs font-semibold sm:px-3 md:px-5 md:py-4">Name</th>
                <th className="hidden px-5 py-4 font-semibold md:table-cell">Relative name</th>
                <th className="hidden px-5 py-4 font-semibold md:table-cell">Age / Gender</th>
                <th className="hidden px-5 py-4 font-semibold md:table-cell">Ward</th>
                <th className="hidden px-5 py-4 font-semibold md:table-cell">House No.</th>
                <th className="w-[72px] px-2 py-3 text-right text-xs font-semibold sm:px-3 md:w-auto md:px-5 md:py-4">View</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-5 py-16 text-center text-sm text-slate-500">
                    Loading voter records...
                  </td>
                </tr>
              ) : voters.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-5 py-16 text-center">
                    <Users className="mx-auto text-slate-300" size={36} />
                    <p className="mt-3 font-medium text-slate-700">
                      No voter records found
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try changing your search or filters.
                    </p>
                  </td>
                </tr>
              ) : (
                voters.map((voter) => (
                  <tr
                    key={voter.voter_id}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-700 sm:px-3 md:px-5 md:py-4 md:text-sm">
                      {voter.panchayat_serial_number ?? "—"}
                    </td>

                    <td className="break-all px-2 py-3 sm:px-3 md:px-5 md:py-4">
                      <span className="font-mono text-[10px] font-medium text-blue-700 sm:text-xs md:text-sm">
                        {voter.voter_id}
                      </span>
                    </td>

                    <td className="min-w-0 px-2 py-3 sm:px-3 md:px-5 md:py-4">
                      <p className="break-words text-xs font-medium text-slate-900 sm:text-sm">
                        {voter.english_name || "—"}
                      </p>
                      {voter.telugu_name && (
                        <p className="mt-1 break-words text-[10px] text-slate-500 sm:text-xs">
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
                      <span className="mx-1 text-slate-300">/</span>
                      {voter.gender || "—"}
                    </td>

                    <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                      {voter.ward_number ?? "—"}
                    </td>

                    <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                      {voter.house_number || "—"}
                    </td>

                    <td className="whitespace-nowrap px-2 py-3 text-right sm:px-3 md:px-5 md:py-4">
                      <button
                        type="button"
                        onClick={() => openVoter(voter)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Eye size={15} />
                        View
                      </button>
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
              disabled={page === 0 || loading}
              onClick={() => setPage((previous) => Math.max(0, previous - 1))}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <button
              type="button"
              disabled={!hasNextPage || loading}
              onClick={() => setPage((previous) => previous + 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Voter profile modal */}
      {selectedVoter && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedVoter(null);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Voter profile
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Electoral roll 2026
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVoter(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
                aria-label="Close profile"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Voter"
                    className="h-32 w-32 rounded-2xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <UserRound size={48} />
                  </div>
                )}

                {profileLoading && (
                  <p className="mt-2 text-xs text-slate-500">
                    Loading photograph...
                  </p>
                )}

                <h4 className="mt-4 text-xl font-semibold text-slate-900">
                  {selectedVoter.english_name || "—"}
                </h4>

                {selectedVoter.telugu_name && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedVoter.telugu_name}
                  </p>
                )}

                <span className="mt-3 rounded-full bg-blue-50 px-3 py-1 font-mono text-sm font-medium text-blue-700">
                  {selectedVoter.voter_id}
                </span>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3">
                {[
                  {
                    label: "V.Sno",
                    value: selectedVoter.panchayat_serial_number ?? "—",
                    icon: Users,
                  },
                  {
                    label: "Age",
                    value: selectedVoter.age ?? "—",
                    icon: Calendar,
                  },
                  {
                    label: "Gender",
                    value: selectedVoter.gender || "—",
                    icon: UserRound,
                  },
                  {
                    label: "Ward",
                    value: selectedVoter.ward_number || "—",
                    icon: MapPin,
                  },
                  {
                    label: "House number",
                    value: selectedVoter.house_number || "—",
                    icon: Home,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Icon size={14} />
                      {label}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 p-4">
                <p className="text-xs text-slate-500">
                  {selectedVoter.relationship_type || "Relative"}
                </p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedVoter.relative_name_english || "—"}
                </p>
                {selectedVoter.relative_name && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedVoter.relative_name}
                  </p>
                )}
              </div>

              {!selectedVoter.photo_path && (
                <p className="mt-4 text-center text-xs text-slate-400">
                  No photograph is linked to this voter record.
                </p>
              )}

              {selectedVoter.photo_path && !photoUrl && !profileLoading && (
                <p className="mt-4 text-center text-xs text-amber-600">
                  Photograph could not be loaded. Check Storage permissions and file path.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
