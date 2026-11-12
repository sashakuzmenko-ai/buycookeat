import { getContext } from "@/lib/context";
import { AppShell } from "@/components/shell";

export default async function AppLayout({ children }: { readonly children: React.ReactNode }) {
  const { household } = await getContext();
  return (
    <AppShell household={household}>
      {children}
    </AppShell>
  );
}
