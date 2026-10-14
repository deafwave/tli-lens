import { describe, expect, it } from 'vitest';
import { fmtDps, parseAdvice, renderGuide, type GuideOut } from '../src/guide-view';
import sample from '../src/data/guide.sample.json';

const g = sample as unknown as GuideOut;
describe('guide view', () => {
  it('formats DPS', () => {
    expect(fmtDps(1.84e14)).toBe('1.84e14');
    expect(fmtDps(999999)).toBe('999999');
    expect(fmtDps(1234567)).toBe('1.23e6');
  });
  const html = renderGuide(g);
  it('one row per step plus triggered respecs', () => {
    expect(html.match(/class="step"/g)).toHaveLength(5);
    expect(html.match(/class="respec"/g)).toHaveLength(1);
    expect(html).toContain('2,500,000');
  });
  it('header, lists and partial flag', () => {
    expect(html).toContain(g.pin);
    expect(html).toContain(g.etor.season);
    for (const l of [...g.notSearched, ...g.unpriced, ...g.notCalculable]) expect(html).toContain(l);
    expect(html).toContain('partial: sample-piece');
  });
  it('parseAdvice rejects wrong mode and schema', () => {
    expect(() => parseAdvice(JSON.stringify(g))).toThrow(/advise/);
    expect(() => parseAdvice('{')).toThrow(/JSON/);
    expect(() => parseAdvice('{"mode":"advise"}')).toThrow(/missing/);
    expect(parseAdvice(JSON.stringify({ ...g, mode: 'advise' })).mode).toBe('advise');
  });
  it('escapes markup and rejects malformed steps', () => {
    const evil = { ...g, steps: [{ ...g.steps[0], move: { ...g.steps[0].move, label: '<script>x</script>' } }] };
    expect(renderGuide(evil)).not.toContain('<script>');
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', steps: [{ ...g.steps[0], level: '<img src=x onerror=alert(1)>' }] }))).toThrow(/steps\[0\]\.level/);
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', steps: [{}] }))).toThrow(/Advice is (missing|invalid): steps\[0\]/);
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', start: {} }))).toThrow(/start\.life100/);
  });
  it('rounds before choosing the exponent form', () => {
    expect(fmtDps(999999.6)).toBe('1.00e6');
  });
});
