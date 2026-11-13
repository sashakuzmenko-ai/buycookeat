import { MODULE_THEMES, HOME_THEME } from "../ui/tokens.ts";

export interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly color: string;
  readonly tint: string;
  readonly ink: string;
  readonly iconPath: string;
  readonly module: string;
}

type NavTuple = readonly [
  name: string,
  href: string,
  color: string,
  tint: string,
  ink: string,
  iconPath: string,
  module: string,
];

function toNavItem([name, href, color, tint, ink, iconPath, module]: NavTuple): NavItem {
  return { name, href, color, tint, ink, iconPath, module };
}

const MAIN_ITEMS_RAW: readonly NavTuple[] = [
  ["Огляд", "/", HOME_THEME.color, HOME_THEME.tint, HOME_THEME.ink, "M4 11l8-7 8 7v9H4z", "home"],
  ["Меню", "/menu", MODULE_THEMES.menu.color, MODULE_THEMES.menu.tint, MODULE_THEMES.menu.ink, "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4", "menu"],
  ["Рецепти", "/recipes", MODULE_THEMES.recipes.color, MODULE_THEMES.recipes.tint, MODULE_THEMES.recipes.ink, "M6 4h12v16H6zM9 8h6M9 12h6", "recipes"],
  ["Склад", "/pantry", MODULE_THEMES.pantry.color, MODULE_THEMES.pantry.tint, MODULE_THEMES.pantry.ink, "M4 5h16v14H4zM4 12h16M9 8.5h6M9 15.5h6", "pantry"],
  ["Магазини", "/shopping", MODULE_THEMES.shops.color, MODULE_THEMES.shops.tint, MODULE_THEMES.shops.ink, "M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0", "shops"],
  ["Фінанси", "/finance", MODULE_THEMES.finance.color, MODULE_THEMES.finance.tint, MODULE_THEMES.finance.ink, "M5 20V10M12 20V4M19 20v-7", "finance"],
  ["Сім'я", "/settings", MODULE_THEMES.family.color, MODULE_THEMES.family.tint, MODULE_THEMES.family.ink, "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5 5 0 0 1 10 0M17 11a2.5 2.5 0 1 0 0-5M15 15a4.5 4.5 0 0 1 6 5", "family"],
  ["Скан", "/scan", MODULE_THEMES.scan.color, MODULE_THEMES.scan.tint, MODULE_THEMES.scan.ink, "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8", "scan"],
];

export const MAIN_NAV_ITEMS: readonly NavItem[] = MAIN_ITEMS_RAW.map(toNavItem);

const PRODUCTS_NAV_ITEM: NavItem = toNavItem([
  "Продукти",
  "/products",
  HOME_THEME.color,
  HOME_THEME.tint,
  HOME_THEME.ink,
  "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0",
  "products",
]);

const MORE_HREFS = new Set<string>(["/recipes", "/shopping", "/finance", "/settings"]);

export const MORE_NAV_ITEMS: readonly NavItem[] = [
  ...MAIN_NAV_ITEMS.filter((item) => MORE_HREFS.has(item.href)),
  PRODUCTS_NAV_ITEM,
];

export function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_NAV_ITEMS.some((item) => isRouteActive(item.href, pathname));
}
