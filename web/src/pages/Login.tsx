import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto px-4">
      <h1 className="text-2xl font-semibold mb-1">Gym Tracker</h1>
      <p className="text-sm text-neutral-500 mb-8">Sign in with your email</p>

      {status === "sent" ? (
        <div className="text-center">
          <p className="text-base mb-2">Check your inbox.</p>
          <p className="text-sm text-neutral-500">
            Click the link in the email to sign in.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="w-full space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-neutral-600 text-base"
            required
            autoFocus
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full py-3 rounded-lg bg-white text-black font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>
      )}
    </div>
  );
}
