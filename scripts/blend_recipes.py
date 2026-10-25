"""Belt blend recipes (the S10 enchant, EquipEnchantS10) read from the running client: packages/guide/src/data/blends.json.
The client's Lua caches each recipe row of wolf.UEquipEnchantS10InfoMgr (Id, EnchantAffixType, EnchantAffixTier {modifier: weight},
EnchantConsume {item id: count}, Show, Type4, ...) once the blend window has been opened; a row leaves out the fields it shares with the
defaults row (Id -1: Type4 [23, 170, 171] = the belts, Show 1). The character's unlocked recipes are EquipEnchantS10Mgr.UnlockFormulaIdMap.
Read-only: poorchlight re/tools/lua_dump.py walks the Lua graph into a temporary directory.
usage (repo root, elevated shell, game running, the blend window opened once this session): python -I scripts/blend_recipes.py [--poorchlight DIR]"""
import gzip, json, os, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/guide/src/data/blends.json'
DD = Path(sys.argv[sys.argv.index('--poorchlight') + 1]) if '--poorchlight' in sys.argv else ROOT.parent / 'poorchlight'

def walk(d):
    subprocess.run([sys.executable, 're/tools/lua_dump.py', 'walk', d], cwd=DD, check=True, stdout=subprocess.DEVNULL)
    S, T = {}, {}
    for l in gzip.open(f'{d}/strings.jsonl.gz', 'rt', encoding='utf-8'):
        o = json.loads(l); S[o['id']] = o.get('t')
    for l in gzip.open(f'{d}/tables.jsonl.gz', 'rt', encoding='utf-8'):
        o = json.loads(l); T[o['id']] = o
    return S, T

def py(S, T, v, depth=5):
    if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
        if v[0] == 's': return S.get(v[1])
        if v[0] == 't' and depth > 0 and v[1] in T:
            t = T[v[1]]
            arr = [py(S, T, x, depth - 1) for x in t.get('arr', [])]
            h = {str(py(S, T, k, 0)): py(S, T, x, depth - 1) for k, x in t.get('h', [])}
            return arr if not h else {**{str(i + 1): a for i, a in enumerate(arr)}, **h}
        return None
    return v

def main():
    with tempfile.TemporaryDirectory() as d:
        S, T = walk(os.path.join(d, 'walk'))   # lua_dump refuses an existing directory
    rows, unlocked = [], set()
    for t in T.values():
        keys = {py(S, T, k, 0) for k, _ in t.get('h', [])}
        if not ({'EnchantConsume', 'EnchantAffixType', 'Id'} <= keys or 'UnlockFormulaIdMap' in keys): continue
        r = {str(py(S, T, k, 0)): py(S, T, v) for k, v in t.get('h', [])}
        if 'EnchantConsume' in r: rows.append(r)
        else: unlocked |= {int(k) for k, on in (r['UnlockFormulaIdMap'] or {}).items() if on}
    defaults = next((r for r in rows if r['Id'] == -1), None)
    if not defaults or not unlocked: sys.exit('no blend recipes in the client: open the blend window once, then run again')
    recipes = []
    for r in sorted((r for r in rows if r['Id'] > 0), key=lambda r: r['Id']):
        x = {**defaults, **{k: v for k, v in r.items() if v not in (None, {}, [])}}
        recipes.append({'id': r['Id'], 'type': x['EnchantAffixType'], 'mods': {int(k): v for k, v in x['EnchantAffixTier'].items()},
                        'consume': {int(k): v for k, v in x['EnchantConsume'].items()}, 'show': x.get('Show', 1) != 0, 'type4': x['Type4']})
    read = {r['id'] for r in recipes}
    out = {'source': 'client Lua (wolf.UEquipEnchantS10InfoMgr rows, EquipEnchantS10Mgr.UnlockFormulaIdMap)', 'at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'unlocked': sorted(unlocked), 'unlockedNotRead': sorted(unlocked - read), 'recipes': recipes}
    OUT.write_text(json.dumps(out, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'{OUT}: {len(recipes)} recipes, {len(unlocked)} unlocked ({len(unlocked - read)} without a row in the client)')

if __name__ == '__main__': main()
