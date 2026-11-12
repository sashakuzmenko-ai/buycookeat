"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, FilterPill } from "@/components/ui";
import { CATALOG_MEAL_FILTERS, catalogHref, type CatalogState } from "@/lib/recipes";

export function CatalogFilters({ state }: { readonly state: CatalogState }) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);

  function go(next: Partial<CatalogState>) {
    router.push(catalogHref({ ...state, q, ...next }));
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          go({});
        }}
      >
        <Field
          label="Пошук за назвою або продуктом"
          name="q"
          id="rec-q"
          placeholder="Наприклад, курка"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          module="recipes"
          wrapperClassName="min-w-[240px] flex-1"
        />
        <Button type="submit" module="recipes">
          Шукати
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <FilterPill module="recipes" active={state.meal === null} onClick={() => go({ meal: null })}>
          Усі
        </FilterPill>
        {CATALOG_MEAL_FILTERS.map((filter) => (
          <FilterPill
            key={filter.meal}
            module="recipes"
            active={state.meal === filter.meal}
            onClick={() => go({ meal: filter.meal })}
          >
            {filter.label}
          </FilterPill>
        ))}
        <FilterPill module="recipes" active={state.quick} onClick={() => go({ quick: !state.quick })}>
          До 30 хв
        </FilterPill>
        <FilterPill module="recipes" active={state.now} onClick={() => go({ now: !state.now })}>
          Можна зараз
        </FilterPill>
      </div>
    </div>
  );
}
