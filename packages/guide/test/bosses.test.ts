import { serialize } from 'node:v8';
import { expect, test } from 'vitest';
import { decodeBlob, rankMaps, TAX, type Run } from '../src/bosses';

const run = (mapId: string, lootNoTax: number, cost: number, minutes: number, status = 'completed'): Run =>
  ({ mapId, status, duration: minutes * 60_000, mapEarnings: { lootNoTax, cost } });

test('Lawbearer always drops a Fallen Starlight: its price (after tax) is added to every run', () => {
  const [row] = rankMaps([run('4030002', 50, -40, 1), run('4030002', 30, -40, 1)], n => (n === 'Fallen Starlight' ? 100 : undefined));
  expect(row.always).toBe(100 * TAX);
  expect(row.net).toBe(0 + 100 * TAX);
  expect(row.perHour).toBeCloseTo(row.net * 60, 9);
  expect(row.unpriced).toEqual([]);
});

test('an unpriced always-drop is named and counts 0; incomplete runs are left out; best FE/h first', () => {
  const rows = rankMaps([run('4030002', 50, -40, 1), run('4020002', 30, -20, 0.5), run('4020002', 999, 0, 1, 'paused')], () => undefined);
  expect(rows.map(r => r.mapId)).toEqual(['4020002', '4030002']);
  expect(rows[0].runs).toBe(1);
  expect(rows[1].unpriced).toEqual(['Fallen Starlight']);
  expect(rows[1].perHour).toBeCloseTo(600, 9);
});

test('decodeBlob reads past the Blink envelope', () => {
  const v8 = serialize({ key: 'gameData' });
  const blink = Buffer.from([0xff, 0x15, 0xfe, ...Array(12).fill(0)]);
  expect(decodeBlob(Buffer.concat([blink, v8]))).toEqual({ key: 'gameData' });
});
