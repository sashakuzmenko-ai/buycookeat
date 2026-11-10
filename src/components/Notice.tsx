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
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-800" : "border-brand-100 bg-brand-50 text-brand-700"
      }`}
    >
      {error ?? info}
    </div>
  );
}
