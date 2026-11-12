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
  ["Огляд", "/", "#14201A", "#EEF1ED", "#14201A", "M4 11l8-7 8 7v9H4z", "home"],
  ["Меню", "/menu", "#1E6B45", "#E3F1E8", "#14522F", "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4", "menu"],
  ["Рецепти", "/recipes", "#B23A24", "#FBE6E0", "#8C2A18", "M6 4h12v16H6zM9 8h6M9 12h6", "recipes"],
  ["Склад", "/pantry", "#19676B", "#DDEFEE", "#124E51", "M4 5h16v14H4zM4 12h16M9 8.5h6M9 15.5h6", "pantry"],
  ["Магазини", "/shopping", "#8A5600", "#FBEFD2", "#6B4300", "M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0", "shops"],
  ["Фінанси", "/finance", "#3346A0", "#E3E7F8", "#26357D", "M5 20V10M12 20V4M19 20v-7", "finance"],
  ["Сім'я", "/settings", "#7A3E78", "#F1E3F0", "#5C2D5A", "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5 5 0 0 1 10 0M17 11a2.5 2.5 0 1 0 0-5M15 15a4.5 4.5 0 0 1 6 5", "family"],
  ["Скан", "/scan", "#14201A", "#EAF6C8", "#14201A", "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8", "scan"],
];

export const MAIN_NAV_ITEMS: readonly NavItem[] = MAIN_ITEMS_RAW.map(toNavItem);

const PRODUCTS_NAV_ITEM: NavItem = toNavItem([
  "Продукти",
  "/products",
  "#14201A",
  "#EEF1ED",
  "#14201A",
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
