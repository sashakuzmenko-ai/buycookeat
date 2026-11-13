export type ModuleName =
  | "menu"
  | "recipes"
  | "pantry"
  | "shops"
  | "stores"
  | "finance"
  | "family"
  | "scan";

export interface ModuleTheme {
  name: string;
  color: string;
  tint: string;
  ink: string;
  accent?: string;
}

export const MODULE_THEMES: Record<ModuleName, ModuleTheme> = {
  menu: {
    name: "Меню",
    color: "#1E6B45",
    tint: "#E3F1E8",
    ink: "#14522F",
  },
  recipes: {
    name: "Рецепти",
    color: "#B23A24",
    tint: "#FBE6E0",
    ink: "#8C2A18",
  },
  pantry: {
    name: "Склад",
    color: "#19676B",
    tint: "#DDEFEE",
    ink: "#124E51",
  },
  shops: {
    name: "Магазини",
    color: "#8A5600",
    tint: "#FBEFD2",
    ink: "#6B4300",
  },
  stores: {
    name: "Магазини",
    color: "#8A5600",
    tint: "#FBEFD2",
    ink: "#6B4300",
  },
  finance: {
    name: "Фінанси",
    color: "#3346A0",
    tint: "#E3E7F8",
    ink: "#26357D",
  },
  family: {
    name: "Сім'я",
    color: "#7A3E78",
    tint: "#F1E3F0",
    ink: "#5C2D5A",
  },
  scan: {
    name: "Скан",
    color: "#14201A",
    tint: "#EAF6C8",
    ink: "#14201A",
    accent: "#C8F169",
  },
};

export const BASE_COLORS = {
  ink: "#14201A",
  ink2: "#4A5750",
  brand: "#1E6B45",
  lime: "#C8F169",
  ground: "#F3F5F1",
  surface: "#FFFFFF",
  line: "#DDE3DC",
  lineStrong: "#C5CEC6",
  track: "#E6EBE6",
  soft: "#EEF1ED",
  inkRaised: "#24332B",
  inkMutedOnDark: "#D5DDD7",
} as const;

export const HOME_THEME: ModuleTheme = {
  name: "Огляд",
  color: BASE_COLORS.ink,
  tint: BASE_COLORS.soft,
  ink: BASE_COLORS.ink,
};
