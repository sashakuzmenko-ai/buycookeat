// Дати зберігаємо як рядки YYYY-MM-DD; арифметика в UTC, щоб не залежати від часового поясу сервера.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Понеділок тижня, до якого належить дата. */
export function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function parseWeekParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (v && ISO.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"))) return weekStart(v);
  return weekStart(todayISO());
}

const dayFmt = new Intl.DateTimeFormat("uk-UA", { weekday: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });

export function formatWeekday(iso: string): string {
  const s = dayFmt.format(new Date(iso + "T00:00:00Z"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso + "T00:00:00Z"));
}
