import { expect, test } from 'vitest';
import { killAverage } from '../src/kill';

test('killAverage', () => {
  expect(killAverage(100, 100)).toBe(100);
  expect(killAverage(200, 100)).toBeCloseTo(100 / Math.log(2), 12);
  expect(killAverage(0, 100)).toBe(0);
  expect(killAverage(100, -1)).toBe(0);
});
