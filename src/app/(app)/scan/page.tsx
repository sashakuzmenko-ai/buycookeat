import { getContext } from "@/lib/context";
import { ScanClient } from "@/components/ScanClient";

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const { supabase } = await getContext();
  const { data } = await supabase.from("products").select("id, name, unit").order("name");
  const params = await searchParams;
  const initialMode = params?.mode === "inventory" || params?.mode === "set" ? "set" : "add";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="h1 mb-1">Додати продукти</h1>
      <p className="mb-4 text-sm text-stone-600">
        Сфотографуйте чек, зніміть коротке відео холодильника або просто надиктуйте продукти. Перед записом у запаси ви
        все перевірите.
      </p>
      <ScanClient products={data ?? []} aiEnabled={Boolean(process.env.OPENROUTER_API_KEY)} initialMode={initialMode} />
    </div>
  );
}
