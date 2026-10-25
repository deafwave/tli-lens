"""The auction house search result on screen, read from the running game's Lua state (read-only): every listed item's price and affixes.
LuaObjectMap[*_AuctionHouseShowGoodV2].GoodDatas[i].GoodData._Raw_Data: PriceNum / PriceType (100300 = Flame Elementium), ItemData._Raw_Data: the item
record ItemMgr.Items holds for an owned item (Type1 1 gear, 26 slate, 34 hero memory, 41 vorax limb), read as poorchlight's reader/loadout.py reads one:
every AffixList list in its LIST_ORDER (FixedBaseAffix holds a ring's, necklace's or belt's implicit and a legendary's; Chip, Enchant), each affix's
Id, TLv (tier), Complex (text), DynArgs as floats; a hero memory's AwakenData.BaseAttrBoostValue / AwakenAffix, a slate's TalentDatas.
usage (elevated shell, game running, a market search open): python scripts/market_listings.py  -> JSON on stdout. Env POORCHLIGHT: the poorchlight checkout
(its reader/ supplies the memory and Lua access; default: the sibling ../poorchlight)."""
import json, os, re, sys
from pathlib import Path
DD = Path(os.environ.get('POORCHLIGHT') or Path(__file__).resolve().parents[2] / 'poorchlight')
sys.path[:0] = [str(DD / 'reader'), str(DD / 're' / 'tools')]
from mem import Proc
from lua import Lua
# the order poorchlight's tli export lists an item's affixes in (export.rs LIST_ORDER)
LIST_ORDER = ('BAffixInfoList', 'FixedBaseAffix', 'BaseAttrInfoList', 'PrefixInfoList', 'SuffixInfoList', 'ChipAffixList', 'EnchantAffixList')

def fast(L):
    """A reader that walks each table once (`L.get` walks the whole table per key) and reads a string at one address once per screen read, in one
    process read when it is short."""
    seen = {}
    def str_(a):
        if a not in seen:
            try: h = L.p.read(a, 0x60); n = int.from_bytes(h[0x10:0x18], 'little')
            except OSError: n = 1 << 16   # a short string at the end of its region
            seen[a] = h[0x20:0x20 + n].decode('utf-8', 'replace') if n <= 0x40 else Lua.str(L, a)
        return seen[a]
    L.str = str_
    return lambda tv: dict(L.items(tv)) if tv else {}

def item(L, T, it):
    """An item record (ItemData._Raw_Data / ItemMgr.Items[id]._Raw_Data) -> {baseId, level, type, affixes, [awaken], [talents, shapeId, influenceId]}."""
    val = lambda tv: tv and L.val(tv)
    r, al = T(it), T(T(it).get('AffixList'))
    def aff(a):
        a = T(a)
        return {'id': val(a.get('Id')), 'tier': val(a.get('TLv')), 'text': re.sub(r'<[^>]+>', '', str(val(a.get('Complex')) or '')),
                'dyn': [float(val(x)) for _, x in sorted(T(a.get('DynArgs')).items())]}
    out = {'baseId': val(r.get('ConfigBaseId')), 'level': val(r.get('Level')), 'type': val(r.get('Type1')),
           'affixes': [{**aff(a), 'list': l} for l in LIST_ORDER for _, a in sorted(T(al.get(l)).items())]}
    aw = T(r.get('AwakenData'))
    if out['type'] == 34:   # a hero memory: what loadout.py's heroMemories entry carries beside the affixes
        out['awaken'] = {'boost': float(val(aw.get('BaseAttrBoostValue')) or 0), 'affixes': [aff(a) for _, a in sorted(T(aw.get('AwakenAffix')).items())]}
    td = T(r.get('TalentDatas'))   # a slate (Pedigree of Gods, divinity slates): its talents, shape and the influence row it rolled (a Sparks of Moth Fire: no talents)
    if out['type'] == 26 or td.get('BaseTalentList'):
        out.update(talents=[val(x) for _, x in sorted(T(td.get('BaseTalentList')).items())], shapeId=val(td.get('ShapeId')), influenceId=val(td.get('InfluenceId')) or 0)
    return out

def listings(L):
    T = fast(L)
    objs = L.path(L.globals(), 'LuaObjectMgr', 'LuaObjectMap')
    # the client keeps an old results view next to the one on screen (a memory search opens a second one): the newest view with goods
    shows = sorted(((int(k.split('_')[0]), v) for k, v in L.items(objs) if isinstance(k, str) and k.endswith('_AuctionHouseShowGoodV2')), key=lambda kv: -kv[0])
    goods = next((g for _, v in shows for g in [T(v).get('GoodDatas')] if g and T(g)), None)
    res = []
    for i, g in sorted(T(goods).items()):
        raw = T(T(T(g).get('GoodData')).get('_Raw_Data'))
        res.append({'n': i, 'price': L.val(raw['PriceNum']), 'priceType': L.val(raw['PriceType']), **item(L, T, T(raw.get('ItemData')).get('_Raw_Data'))})
    return res

if __name__ == '__main__':
    if '--serve' in sys.argv:   # market.ts --watch: one read per line on stdin, one JSON line out; attached once (again after a failed read: the game restarted)
        L = None
        for _ in sys.stdin:
            try:
                L = L or Lua(Proc()); out = listings(L)
            except Exception as e:
                L, out = None, {'error': str(e)}
            print(json.dumps(out), flush=True)
    else:
        print(json.dumps(listings(Lua(Proc())), ensure_ascii=False))
