import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-sm mx-auto px-6 py-12">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 ring-1 ring-neutral-700 flex items-center justify-center mb-5">
        <span className="text-2xl font-bold tracking-tight">G</span>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Gym Tracker</h1>
      <p className="text-sm text-neutral-500 mb-8">Sign in</p>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-700 text-base"
          required
          autoFocus
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-700 text-base"
          required
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:bg-neutral-200"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </form>
    </div>
  );
}
