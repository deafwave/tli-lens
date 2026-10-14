import { describe, expect, it, vi } from 'vitest';
import history from './fixtures/etor-history-mini.json';
import items from './fixtures/etor-items-mini.json';
import { fetchSnapshot, historyBook, snapshotBook, type EtorHistory, type EtorItems } from '../src/pricing';

const I = items as EtorItems, H = history as EtorHistory;
const book = historyBook(I, H);

describe('historyBook', () => {
  it('picks the window by hero level', () => {
    const h = H.items['110101']!;
    expect(book.price(110101, 60)).toBe(h.day1);
    expect(book.price(110101, 69)).toBe(h.day1);
    expect(book.price(110101, 75)).toBe(h.days1to3);
    expect(book.price(110101, 85)).toBe(h.week1);
    expect(book.price(110101, 95)).toBe(h.week2);
    expect(book.price(110101, 100)).toBe(h.week2);
  });
  it('falls back to the later window, then last', () => {
    // Cover the Sun: week2 null
    expect(book.price(112519, 95)).toBe(H.items['112519']!.last);
    const gap = { items: { '110104': { ...H.items['110104']!, days1to3: null } } };
    expect(historyBook(I, gap).price(110104, 75)).toBe(H.items['110104']!.week1);
  });
  it('name and id lookups agree; unknown name is null', () => {
    for (const lvl of [60, 75, 85, 95]) expect(book.price('Highest Glance', lvl)).toBe(book.price(110104, lvl));
    expect(book.price('highest glance', 60)).toBeNull();
    expect(book.price('No Such Item', 60)).toBeNull();
    expect(book.price(1, 60)).toBeNull();
  });
  it('1 FE placeholder with no history is null; a real price with no history is kept', () => {
    expect(book.price('God of War\'s Divinity', 60)).toBeNull();
    expect(book.price(400000, 60)).toBe(0.037);
  });
});

describe('snapshotBook', () => {
  it('ignores level and carries the season', () => {
    const s = snapshotBook(I);
    expect(s.price(110101, 60)).toBe(10.083);
    expect(s.price('Arminius Guillotine', 100)).toBe(10.083);
    expect(s.price('God of War\'s Divinity', 60)).toBeNull();
    expect([s.season, s.fetchedAt]).toEqual([I.season, I.fetchedAt]);
  });
});

describe('fetchSnapshot', () => {
  it('builds the URL and header', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(I)));
    expect(await fetchSnapshot(1501, f as unknown as typeof fetch)).toEqual(I);
    expect(f).toHaveBeenCalledWith('https://etor-beta.710421059.xyz/etor-api/api/prices-snapshot/1501',
      { headers: { 'x-frontend-version': '1.0.6.2' } });
  });
  it('throws on HTTP error', async () => {
    await expect(fetchSnapshot(1, (async () => new Response('', { status: 500 })) as unknown as typeof fetch)).rejects.toThrow('500');
  });
});
