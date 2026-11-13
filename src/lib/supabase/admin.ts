import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServerKey } from "../channels/access.ts";
import { SUPABASE_URL } from "./server.ts";

/** Лише сервер. Новий secret key, інакше legacy service_role. У браузер цей ключ не віддаємо. */
export function createServiceClient(): SupabaseClient | null {
  const key = supabaseServerKey({
    secretKey: process.env.SUPABASE_SECRET_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "User-Agent": "cookandeat-server" } },
  });
}
