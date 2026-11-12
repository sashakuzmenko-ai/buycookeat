// Спільні типи для розпізнавання (фото / кадри відео / голос → позиції для запасів)

export type ScanMode = "add" | "set"; // add: купили, додати; set: інвентаризація, стільки є зараз

export type ScanItem = {
  raw: string; // як було на чеку / у диктовці
  productId: string | null; // збіг із базою продуктів
  name: string; // назва для нового продукту
  category: string;
  unit: "г" | "мл" | "шт";
  quantity: number; // в одиниці продукту
  uncertain: boolean;
};

export type ScanResult = {
  source: "voice" | "images" | "both" | "none";
  store: string;
  total: number;
  items: ScanItem[];
  costUsd: number | null;
  model: string;
};

export const SCAN_LIMITS = {
  maxImages: 12,
  maxAudioSeconds: 45,
  maxBodyBytes: 4_200_000, // запас до ліміту Vercel 4,5 МБ
};
