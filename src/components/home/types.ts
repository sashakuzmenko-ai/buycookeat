import type { DishStatus } from "@/lib/menu";
import type { StorageZone } from "@/lib/pantry";

export type HomeMealView = {
  id: string;
  slot: "breakfast" | "lunch" | "dinner";
  slotLabel: string;
  title: string;
  minutes: number | null;
  meta: string;
  status: DishStatus;
  isNextUncooked: boolean;
};

export type HomeWeekView = {
  start: string;
  label: string;
  sum: number;
  isCurrent: boolean;
  barHeight: number;
};

export type HomeAlertView = {
  id: string;
  productId: string;
  name: string;
  qty: string;
  storageZone: StorageZone;
  scalePercent: number;
  isExpiring: boolean;
  isLow: boolean;
  note: string;
};

export type HomeScanView = {
  id: string;
  time: string;
  title: string;
  note: string;
  status: string;
};

export type HomePendingScan = {
  id: string;
  title: string;
  note: string;
  uncertainCount: number;
  itemCount: number;
};

export type HomeModel = {
  today: string;
  dateLabel: string;
  familyCount: number;
  portions: number;

  finance: {
    hasBudget: boolean;
    budget: number | null;
    monthSpent: number;
    monthLabel: string;
    progressPercent: number;
    paceNote: string | null;
    todaySpent: number;
    receiptCount: number;
  };

  pantry: {
    totalCount: number;
    lowCount: number;
    expiringCount: number;
    alerts: HomeAlertView[];
  };

  menu: {
    hasMenu: boolean;
    cookedCount: number;
    plannedCount: number;
    emptySlotsCount: number;
    todayMeals: HomeMealView[];
    nextMeal: HomeMealView | null;
    subsequentMeal: HomeMealView | null;
  };

  shopping: {
    toBuyCount: number;
    toBuySum: number;
    storesSummary: string;
    storesCount: number;
  };

  weeks: HomeWeekView[];
  recentScans: HomeScanView[];
  pendingScan: HomePendingScan | null;
};
