import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RESET_COOKIE } from "@/lib/reset-cookie";

// Сюди веде посилання з листа підтвердження пошти або відновлення пароля:
// міняємо code на сесію.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const isReset = request.cookies.get(RESET_COOKIE)?.value === "1";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(isReset ? "/reset-password" : "/", request.url));
      if (isReset) response.cookies.delete(RESET_COOKIE);
      return response;
    }
  }

  if (isReset) {
    const error = encodeURIComponent("Посилання застаріло або відкрите в іншому браузері. Запросіть новий лист.");
    const response = NextResponse.redirect(new URL(`/forgot-password?error=${error}`, request.url));
    response.cookies.delete(RESET_COOKIE);
    return response;
  }
  const info = encodeURIComponent("Пошту підтверджено. Увійдіть зі своїм паролем.");
  return NextResponse.redirect(new URL(`/login?info=${info}`, request.url));
}
