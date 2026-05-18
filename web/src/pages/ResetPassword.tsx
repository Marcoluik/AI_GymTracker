import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-sm mx-auto px-6 py-12">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 ring-1 ring-neutral-700 flex items-center justify-center mb-5">
        <span className="text-2xl font-bold tracking-tight">G</span>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
      <p className="text-sm text-neutral-500 mb-8">Pick something at least 8 characters.</p>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-700 text-base"
          required
          autoFocus
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-700 text-base"
          required
          autoComplete="new-password"
        />
        {tooShort && (
          <p className="text-amber-400 text-xs text-center">At least 8 characters.</p>
        )}
        {mismatch && (
          <p className="text-amber-400 text-xs text-center">Passwords don't match.</p>
        )}
        <button
          type="submit"
          disabled={!valid || submitting}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:bg-neutral-200"
        >
          {submitting ? "Saving…" : "Save password"}
        </button>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </form>
    </div>
  );
}
