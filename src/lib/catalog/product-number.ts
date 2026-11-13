/** Зіставлення номера рядка з довідником продуктів (1-based, як у промпті OpenRouter). */
export function productByListNumber<T extends { id: string }>(
  productNumber: unknown,
  products: readonly T[],
): T | null {
  const number = Number(productNumber);
  if (!Number.isInteger(number) || number < 1 || number > products.length) return null;
  return products[number - 1] ?? null;
}
