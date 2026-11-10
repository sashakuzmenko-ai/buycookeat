import { getContext } from "@/lib/context";
import { Nav } from "@/components/Nav";
import { signOut } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household } = await getContext();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-stone-200 bg-[#f7f6f2]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Cook &amp; Eat</div>
            <div className="truncate text-xs text-stone-500">
              {household.name}
              {household.city ? ` · ${household.city}` : ""}
            </div>
          </div>
          <form action={signOut}>
            <button className="text-xs text-stone-500 underline-offset-2 hover:underline">Вийти</button>
          </form>
        </div>
        <div className="mt-2">
          <Nav />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
