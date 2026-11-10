import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { addEquipment, addFamilyMember, addStore, deleteRow, updateFamilyMember } from "../actions";

const ACCESS: Record<string, string> = { walk: "пішки", drive: "їхати", delivery: "доставка" };
const FREQUENCY: Record<string, string> = { daily: "щодня", weekly: "раз на тиждень", rare: "зрідка" };

function DeleteButton({ table, id, label }: { table: string; id: string; label: string }) {
  return (
    <form action={deleteRow}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost" aria-label={`Видалити: ${label}`}>×</button>
    </form>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { supabase, family, portions } = await getContext();
  const [storesRes, equipmentRes] = await Promise.all([
    supabase.from("stores").select("id, name, access, visit_frequency, phone, url, notes").order("sort_order"),
    supabase.from("equipment").select("id, name").order("name"),
  ]);
  const stores = storesRes.data ?? [];
  const equipment = equipmentRes.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="h1 mb-1">Сім&apos;я, магазини, техніка</h1>
        <Notice params={await searchParams} />
      </div>

      <section className="card">
        <h2 className="h2">Хто їсть</h2>
        <p className="mb-3 text-xs text-stone-500">
          Порція — частка від дорослої: дорослий 1, дитина 4–5 років ≈ 0,55, дитина 1–2 роки ≈ 0,3. Разом зараз:{" "}
          <span className="font-medium text-stone-700">{portions.toLocaleString("uk-UA")}</span> дорослої порції.
        </p>
        <ul className="mb-3 divide-y divide-stone-100 text-sm">
          {family.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">
                {m.name}
                <span className="ml-2 text-xs text-stone-400">{m.kind === "child" ? "дитина" : "дорослий"}</span>
              </span>
              <form action={updateFamilyMember} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={m.id} />
                <input
                  className="input w-20 py-1 text-right"
                  name="portion_factor"
                  inputMode="decimal"
                  defaultValue={String(m.portion_factor).replace(".", ",")}
                  aria-label={`Порція: ${m.name}`}
                />
                <button className="btn-secondary px-2.5 py-1">ок</button>
              </form>
              <DeleteButton table="family_members" id={m.id} label={m.name} />
            </li>
          ))}
        </ul>
        <form action={addFamilyMember} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <label className="label" htmlFor="fm-name">Ім&apos;я</label>
            <input className="input" id="fm-name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="fm-kind">Хто</label>
            <select className="input" id="fm-kind" name="kind" defaultValue="adult">
              <option value="adult">дорослий</option>
              <option value="child">дитина</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fm-factor">Порція</label>
            <input className="input w-20" id="fm-factor" name="portion_factor" inputMode="decimal" defaultValue="1" required />
          </div>
          <button className="btn">Додати</button>
        </form>
      </section>

      <section className="card">
        <h2 className="h2">Магазини і доставки</h2>
        <p className="mb-3 text-xs text-stone-500">Порядок і частота визначають групи у списку покупок.</p>
        <ul className="mb-3 divide-y divide-stone-100 text-sm">
          {stores.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">
                {s.name}
                {(s.phone || s.notes) && (
                  <span className="ml-2 text-xs text-stone-400">{[s.phone, s.notes].filter(Boolean).join(" · ")}</span>
                )}
              </span>
              <span className="chip">{ACCESS[s.access]}</span>
              <span className="chip">{FREQUENCY[s.visit_frequency]}</span>
              <DeleteButton table="stores" id={s.id} label={s.name} />
            </li>
          ))}
        </ul>
        <form action={addStore} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <div>
            <label className="label" htmlFor="st-name">Назва</label>
            <input className="input" id="st-name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="st-access">Як дістатись</label>
            <select className="input" id="st-access" name="access" defaultValue="walk">
              <option value="walk">пішки</option>
              <option value="drive">їхати</option>
              <option value="delivery">доставка</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-frequency">Як часто</label>
            <select className="input" id="st-frequency" name="visit_frequency" defaultValue="daily">
              <option value="daily">щодня</option>
              <option value="weekly">раз на тиждень</option>
              <option value="rare">зрідка</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-phone">Телефон</label>
            <input className="input" id="st-phone" name="phone" type="tel" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="st-notes">Що там купуємо</label>
            <input className="input" id="st-notes" name="notes" placeholder="напр.: м'ясо, сири, побутова хімія" />
          </div>
          <div>
            <button className="btn">Додати магазин</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="h2 mb-3">Техніка на кухні</h2>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {equipment.map((e) => (
            <li key={e.id} className="flex items-center rounded-full bg-stone-100 pl-3">
              {e.name}
              <DeleteButton table="equipment" id={e.id} label={e.name} />
            </li>
          ))}
        </ul>
        <form action={addEquipment} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="eq-name">Назва</label>
            <input className="input" id="eq-name" name="name" placeholder="напр.: мультиварка, аерогриль" required />
          </div>
          <button className="btn">Додати</button>
        </form>
      </section>
    </div>
  );
}
