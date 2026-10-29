import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogDir, dataRoot, pinCommit, pinRoot, table } from '../src/pin';
import { withSeasonTable } from '@dps/src/harness/season';

const saved = process.env.TLI_LENS_PIN;
afterEach(() => { if (saved === undefined) delete process.env.TLI_LENS_PIN; else process.env.TLI_LENS_PIN = saved; });

describe('pin', () => {
  it('walks up to the pin without TLI_LENS_PIN, and honours the env var', () => {
    delete process.env.TLI_LENS_PIN;
    const found = pinRoot();
    expect(found.replaceAll('\\', '/')).toMatch(/poorchlight\/\.worktrees\/tli-lens-pin$/);
    expect(existsSync(catalogDir())).toBe(true);
    process.env.TLI_LENS_PIN = 'X:/elsewhere';
    expect(pinRoot()).toBe('X:/elsewhere');
  });
  it('table() returns the highest revision, parsed once', () => {
    delete process.env.TLI_LENS_PIN;
    const t = table<{ rows: Record<string, unknown> }>('config_talent'), file = JSON.parse(readFileSync(join(catalogDir(), 'config_talent.r2.json'), 'utf8'));
    // the later clients' rows laid over the file's (the model's withSeasonTable)
    expect(t).toEqual({ ...file, rows: withSeasonTable('config_talent', file.rows, join(dataRoot(), 'catalog')) });
    expect(table('config_talent')).toBe(t);
    expect(table('config_item_base')).toBeDefined();   // unrevised table
    expect(() => table('no_such_table')).toThrow(/not found/);
  });
  it('pinCommit() is a 40-hex string', () => { expect(pinCommit()).toMatch(/^[0-9a-f]{40}$/); });
});
