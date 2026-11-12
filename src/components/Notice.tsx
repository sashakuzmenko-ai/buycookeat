type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Показує ?error= / ?info= з адреси сторінки. */
export function Notice({ params }: { params: Params }) {
  const error = first(params.error);
  const info = first(params.info);
  if (!error && !info) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-4 rounded-12 border px-4 py-3 text-sm font-medium ${
        error
          ? "border-recipes/30 bg-recipes-tint text-recipes-ink"
          : "border-menu/30 bg-menu-tint text-menu-ink"
      }`}
    >
      {error ?? info}
    </div>
  );
}
