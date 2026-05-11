import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in Netlify env vars (or .env.local for dev).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const ALLOWED_EMAIL = import.meta.env.VITE_ALLOWED_EMAIL as string;
