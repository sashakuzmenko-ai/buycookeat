export interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly color: string;
  readonly tint: string;
  readonly ink: string;
  readonly iconPath: string;
  readonly module: string;
}

export const MAIN_NAV_ITEMS: readonly NavItem[] = [
  {
    name: "Огляд",
    href: "/",
    color: "#14201A",
    tint: "#EEF1ED",
    ink: "#14201A",
    iconPath: "M4 11l8-7 8 7v9H4z",
    module: "home",
  },
  {
    name: "Меню",
    href: "/menu",
    color: "#1E6B45",
    tint: "#E3F1E8",
    ink: "#14522F",
    iconPath: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
    module: "menu",
  },
  {
    name: "Рецепти",
    href: "/recipes",
    color: "#B23A24",
    tint: "#FBE6E0",
    ink: "#8C2A18",
    iconPath: "M6 4h12v16H6zM9 8h6M9 12h6",
    module: "recipes",
  },
  {
    name: "Склад",
    href: "/pantry",
    color: "#19676B",
    tint: "#DDEFEE",
    ink: "#124E51",
    iconPath: "M4 5h16v14H4zM4 12h16M9 8.5h6M9 15.5h6",
    module: "pantry",
  },
  {
    name: "Магазини",
    href: "/shopping",
    color: "#8A5600",
    tint: "#FBEFD2",
    ink: "#6B4300",
    iconPath: "M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0",
    module: "shops",
  },
  {
    name: "Фінанси",
    href: "/finance",
    color: "#3346A0",
    tint: "#E3E7F8",
    ink: "#26357D",
    iconPath: "M5 20V10M12 20V4M19 20v-7",
    module: "finance",
  },
  {
    name: "Сім'я",
    href: "/settings",
    color: "#7A3E78",
    tint: "#F1E3F0",
    ink: "#5C2D5A",
    iconPath: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5 5 0 0 1 10 0M17 11a2.5 2.5 0 1 0 0-5M15 15a4.5 4.5 0 0 1 6 5",
    module: "family",
  },
  {
    name: "Скан",
    href: "/scan",
    color: "#14201A",
    tint: "#EAF6C8",
    ink: "#14201A",
    iconPath: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8",
    module: "scan",
  },
];

const PRODUCTS_NAV_ITEM: NavItem = {
  name: "Продукти",
  href: "/products",
  color: "#14201A",
  tint: "#EEF1ED",
  ink: "#14201A",
  iconPath: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0",
  module: "products",
};

const MORE_HREFS: readonly string[] = ["/recipes", "/shopping", "/finance", "/settings"];

export const MORE_NAV_ITEMS: readonly NavItem[] = [
  ...MAIN_NAV_ITEMS.filter((item) => MORE_HREFS.includes(item.href)),
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
