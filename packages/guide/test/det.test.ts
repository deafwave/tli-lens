import { expect, test } from 'vitest';
import { least } from '../src/det';

test('least finds where a monotone step turns true', () => {
  expect(least((x) => x >= 54.2056, -100, 1000)).toBeCloseTo(54.2056, 5);
  expect(least((x) => x >= -100, -100, 1000)).toBeCloseTo(-100, 5);
});
