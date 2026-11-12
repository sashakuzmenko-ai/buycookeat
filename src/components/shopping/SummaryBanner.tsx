import React from "react";
import { moveShoppingItems } from "@/app/(app)/shopping/actions";
import type { SavingsRecommendation } from "@/lib/prices";

export interface SummaryBannerProps {
  totalCount: number;
  pricedCount: number;
  totalSum: number;
  routeStores: { id: string; name: string }[];
  recommendation: SavingsRecommendation | null;
  week: string;
}

export function SummaryBanner({
  totalCount,
  pricedCount,
  totalSum,
  routeStores,
  recommendation,
  week,
}: SummaryBannerProps) {
  const routeText = routeStores.length > 0 ? routeStores.map((s) => s.name).join(" → ") : "—";

  return (
    <div className="box-border p-4 md:p-[18px_24px] rounded-[18px] bg-[#FBEFD2] flex flex-wrap gap-4 md:gap-x-10 items-center text-[#6B4300]">
      <div>
        <div className="text-[13px] text-[#6B4300]">
          Разом
          {pricedCount < totalCount && pricedCount > 0 && (
            <span className="ml-1 text-[11px] opacity-80">
              (за {pricedCount} з {totalCount} позицій із ціною)
            </span>
          )}
        </div>
        <div className="font-unbounded font-bold text-lg md:text-[20px] text-ink">
          {totalCount} позицій · {pricedCount > 0 ? `≈ ${Math.round(totalSum).toLocaleString("uk-UA")} ₴` : "ціни невідомі"}
        </div>
      </div>

      <div>
        <div className="text-[13px] text-[#6B4300]">Маршрут</div>
        <div className="font-unbounded font-bold text-lg md:text-[20px] text-ink">
          {routeText}
        </div>
      </div>

      {recommendation && (
        <div className="flex-1 min-w-[260px] flex flex-wrap items-center justify-between gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#E8DCB8]">
          <div className="text-[14px] leading-snug text-[#6B4300] max-w-md">
            <span className="font-bold">В {recommendation.targetStoreName} на {recommendation.savingAmount} ₴ дешевше</span>{" "}
            {recommendation.itemNames.slice(0, 3).join(", ")}
            {recommendation.itemNames.length > 3 ? " та інші" : ""} — за вашими чеками.
          </div>
          <form action={moveShoppingItems}>
            <input type="hidden" name="week" value={week} />
            <input type="hidden" name="store_id" value={recommendation.targetStoreId} />
            <input type="hidden" name="ids" value={JSON.stringify(recommendation.itemIds)} />
            <button
              type="submit"
              className="h-[44px] px-4 rounded-12 bg-[#8A5600] text-white font-semibold text-[14px] hover:bg-[#724600] active:scale-[0.98] transition cursor-pointer"
            >
              Перенести в {recommendation.targetStoreName}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
