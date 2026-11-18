import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck, LoaderCircle, Smartphone } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, session, loading } = useAuth();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><p className="text-sm font-medium text-slate-600">Loading your portal...</p></main>;
  }
  if (session) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const digits = mobile.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setSubmitting(true);
    try {
      await login(`+91${digits}`, password);
    } catch (err) {
      setError(err.message || "Unable to sign in. Check your mobile number and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-100/70 to-transparent" />
      <form onSubmit={handleSubmit} className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20"><ShieldCheck size={28} /></div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Narasannapalem</h1>
          <p className="mt-1 text-sm font-medium text-blue-700">Voter Portal</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">Sign in using the mobile number registered by your portal administrator.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="login-mobile" className="mb-1.5 block text-sm font-medium text-slate-700">Mobile number</label>
            <div className="flex overflow-hidden rounded-xl border border-slate-300 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
              <span className="inline-flex items-center gap-2 border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600"><Smartphone size={16} /> +91</span>
              <input id="login-mobile" type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus required maxLength={10} pattern="[6-9][0-9]{9}" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" className="min-w-0 flex-1 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            </div>
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting && <LoaderCircle size={18} className="animate-spin" />}
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <p className="mt-6 text-center text-xs text-slate-400">Electoral Roll 2026</p>
      </form>
    </main>
  );
}
