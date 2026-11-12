import { ScanScreen } from "@/components/scan/ScanScreen";
import { getContext } from "@/lib/context";
import type { StorageZone } from "@/lib/db-types";
import { STORAGE_ZONE_LABELS } from "@/lib/pantry";
import { listIncomingScans } from "@/lib/scan/inbox";

const ZONES = new Set<string>(["fridge", "freezer", "pantry"]);

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const params = await searchParams;
  const { supabase, householdId } = await getContext();
  const selectedId = typeof params.id === "string" ? params.id : null;
  const initialMode = params.mode === "inventory" || params.mode === "set" ? "set" : "add";

  const [listed, productsRes, zonesRes, bindingRes] = await Promise.all([
    listIncomingScans(supabase, householdId),
    supabase.from("products").select("id, name, unit, category").eq("household_id", householdId).order("name"),
    supabase.from("pantry_items").select("product_id, storage_zone").eq("household_id", householdId),
    supabase
      .from("channel_bindings")
      .select("id")
      .eq("household_id", householdId)
      .eq("channel", "telegram")
      .not("linked_at", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!listed.ok) {
    return <p className="text-sm text-ink-muted-on-dark">{listed.error}</p>;
  }

  const zones: Record<string, string> = {};
  for (const row of zonesRes.data ?? []) {
    const productId = String(row.product_id ?? "");
    const zone = String(row.storage_zone ?? "");
    if (productId && ZONES.has(zone)) zones[productId] = STORAGE_ZONE_LABELS[zone as StorageZone];
  }

  const products = (productsRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    unit: String(row.unit ?? "шт"),
    category: String(row.category ?? "інше"),
  }));

  const loadError = productsRes.error?.message ?? zonesRes.error?.message ?? bindingRes.error?.message ?? null;

  return (
    <ScanScreen
      scans={listed.scans}
      products={products}
      zones={zones}
      telegramLinked={Boolean(bindingRes.data)}
      aiEnabled={Boolean(process.env.OPENROUTER_API_KEY)}
      selectedId={selectedId}
      initialMode={initialMode}
      nowIso={new Date().toISOString()}
      loadError={loadError}
    />
  );
}
