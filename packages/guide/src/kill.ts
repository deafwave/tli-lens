/** Kill average: (d100 − d0) / ln(d100 / d0); equal ends → d100; any end ≤ 0 → 0. */
export function killAverage(d100: number, d0: number): number {
  if (!(d100 > 0) || !(d0 > 0)) return 0;
  if (d100 === d0) return d100;
  return (d100 - d0) / Math.log(d100 / d0);
}
