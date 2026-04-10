"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
