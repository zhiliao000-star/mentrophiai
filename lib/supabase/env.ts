export function getSupabasePublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing Supabase public environment variables");
    }

    return {
      supabaseUrl: supabaseUrl ?? "",
      supabaseAnonKey: supabaseAnonKey ?? "",
    };
  }

  return { supabaseUrl, supabaseAnonKey };
}
