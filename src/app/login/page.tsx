import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Notice } from "@/components/Notice";
import { signIn, signUp } from "../auth-actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isSupabaseConfigured) redirect("/setup");
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="h1 mb-1">Cook &amp; Eat</h1>
      <p className="mb-6 text-sm text-stone-600">Від продуктів до готової тарілки</p>
      <Notice params={params} />
      <form className="card space-y-3">
        <div>
          <label className="label" htmlFor="email">Пошта</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Пароль</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn flex-1" formAction={signIn}>Увійти</button>
          <button className="btn-secondary flex-1" formAction={signUp}>Зареєструватись</button>
        </div>
      </form>
    </main>
  );
}
