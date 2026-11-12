/**
 * Утиліти для розділу «Сім'я»: розрахунки віку, порцій, бюджету та міток обмежень.
 */

export const DEFAULT_EQUIPMENT = [
  "Духовка",
  "Мультиварка",
  "Блендер",
  "Мікрохвильовка",
  "Гриль",
  "Аерогриль",
  "Плита",
] as const;

/**
 * Заголовок розділу за кількістю людей (концепт: «Нас четверо»).
 */
export function familyCountTitle(count: number): string {
  switch (count) {
    case 0:
      return "Поки нікого";
    case 1:
      return "Нас один";
    case 2:
      return "Нас двоє";
    case 3:
      return "Нас троє";
    case 4:
      return "Нас четверо";
    case 5:
      return "Нас п'ятеро";
    case 6:
      return "Нас шестеро";
    case 7:
      return "Нас семеро";
    default:
      return `Нас ${count}`;
  }
}

/**
 * Відмінювання років для віку: 1 рік, 2–4 роки, 5–20 років.
 */
export function pluralYears(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 19) return "років";
  if (rem10 === 1) return "рік";
  if (rem10 >= 2 && rem10 <= 4) return "роки";
  return "років";
}

/**
 * Розрахунок ролі чи віку для картки людини.
 */
export function formatMemberRole(
  member: {
    kind: "adult" | "child";
    birth_date?: string | null;
    notes?: string | null;
  },
  referenceDate = new Date()
): string {
  if (member.birth_date) {
    const birth = new Date(member.birth_date);
    if (!isNaN(birth.getTime())) {
      let age = referenceDate.getFullYear() - birth.getFullYear();
      const m = referenceDate.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && referenceDate.getDate() < birth.getDate())) {
        age--;
      }
      if (age >= 0 && age < 120) {
        return `${age} ${pluralYears(age)}`;
      }
    }
  }

  if (member.notes && member.notes.trim()) {
    return member.notes.trim();
  }

  return member.kind === "child" ? "дитина" : "дорослий";
}

/**
 * Форматування коефіцієнта порції з комою: 1.0 -> "1,0", 0.8 -> "0,8".
 */
export function formatPortionFactor(factor: number): string {
  return factor.toFixed(1).replace(".", ",");
}

/**
 * Розрахунок відсотка шкали (базова порція 1.0 = 100%).
 */
export function calculatePortionWidthPercent(factor: number): number {
  if (factor <= 0) return 0;
  return Math.min(100, Math.round((factor / 1.0) * 100));
}

/**
 * Зміна коефіцієнта порції кроком 0,1 у межах [0.1, 3.0].
 */
export function stepPortionFactor(current: number, direction: "inc" | "dec"): number {
  const delta = direction === "inc" ? 0.1 : -0.1;
  const next = Math.round((current + delta) * 10) / 10;
  return Math.min(3.0, Math.max(0.1, next));
}

/**
 * Форматування загальної кількості порцій з відмінюванням.
 */
export function formatPortionsLabel(portions: number): string {
  const formatted = portions.toLocaleString("uk-UA", {
    minimumFractionDigits: portions % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 2,
  });

  if (portions % 1 !== 0) {
    return `${formatted} порції`;
  }

  const n = Math.round(portions);
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 19) return `${formatted} порцій`;
  if (rem10 === 1) return `${formatted} порція`;
  if (rem10 >= 2 && rem10 <= 4) return `${formatted} порції`;
  return `${formatted} порцій`;
}

/**
 * Денний бюджет з місячного (30 днів на місяць).
 */
export function dailyBudgetUah(monthlyBudget: number | null | undefined): number | null {
  if (monthlyBudget == null || isNaN(monthlyBudget) || monthlyBudget <= 0) {
    return null;
  }
  return Math.round(monthlyBudget / 30);
}

/**
 * Перевірка, чи є обмеження алергією.
 */
export function isAllergy(text: string): boolean {
  return /алерг|allergy/i.test(text);
}

/**
 * Парсинг списку обмежень з рядка (розділювач — кома чи новий рядок).
 */
export function parseRestrictions(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
