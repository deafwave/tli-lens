/** Shared interfaces of the guide. dps-debug types are imported from the pin (tsconfig path `@dps/*` → `<pin>/model/*`). */
import type { Change } from '@dps/src/core/whatif';
import type { LoadoutPatch } from './patches';

export type Skill = 'iceShot' | 'hoa';
/** A dps-debug loadout file (dps-debug model/src/core/loadout.ts `Loadout`), kept opaque here. */
export type Loadout = Record<string, unknown>;
export type { Change };

/** One owned item from a tli-lens export (dps-debug reader/export.py, schema tli-lens-export/1). */
export interface OwnedItem {
  itemId: string; baseId: number; baseName: string | null; level: number;
  where: string; page: number; slot: number; count: number;
  modifiers: Record<string, { id: number; dynArgs: number[] }[]>;
}

export interface State { loadout: Loadout; owned: OwnedItem[]; fe: number; level: number; skill: Skill }

/** A dps-debug figure reduced to what the search needs. `partial` = names of dropped pieces / needs; `stop` = the figure did not compute. */
export interface Figure { life100: number; life0: number; kill: number; partial: string[]; stop?: string }

export type MoveKind = 'gear' | 'craft' | 'unique' | 'talent' | 'core' | 'prism' | 'inverse' | 'slate' | 'pact'
  | 'kismet' | 'memory' | 'support' | 'skill' | 'trait' | 'switch';

export interface Move {
  kind: MoveKind;
  /** human text for the guide, e.g. "Craft T1 +% Cold Damage (prefix) on the bow" */
  label: string;
  /** true = costs FE (outer loop); false = reconfiguration (inner loop, churn-gated) */
  acquisition: boolean;
  /** FE cost; null = unpriced (listed, never ranked). Reconfigurations: 0. */
  costFE: number | null;
  /** hero level gate */
  minLevel: number;
  /** dps-debug what-if changes applied in order (dps-debug model/src/core/whatif.ts `Change`; a `LoadoutPatch` is applied by applyPatch, runs of Changes by applyChanges) */
  changes: (Change | LoadoutPatch)[];
  /** mode 2: the owned itemId this move uses (cost 0, consumed once) */
  consumes?: string;
  /** set by generators for moves whose value may appear only after a re-solve (reservation efficiency, +support
   *  levels, grants a talent/core, Pedigree slates, tree-granting slates): always re-solved in the outer loop */
  enabler?: boolean;
  /** the skill after the move (only `switch` moves change it) */
  skill?: Skill;
}

export interface EvalCtx { level: number; skill: Skill }
export interface Evaluated { loadout: Loadout; figure: Figure; dropped: string[] }
export interface Evaluator {
  /** apply `changes` to `loadout` in order (a `LoadoutPatch` through applyPatch, the rest through dps-debug applyGearChange / applyOtherChange) and price the result */
  run(loadout: Loadout, changes: (Change | LoadoutPatch)[], ctx: EvalCtx): Promise<Evaluated>;
  readonly pin: string;
  close(): Promise<void>;
}

export interface PriceBook {
  season: string; fetchedAt: string;
  /** FE price of an item by etor id or exact English name at a hero level (ideal: level picks the history window) */
  price(key: number | string, level: number): number | null;
}

/** `notSearched`: generators add one line per configuration they skip because its rule is not ported (copied to GuideOut.notSearched) */
export interface GenCtx { prices: PriceBook; level: number; notSearched: Set<string> }
export type Generator = (s: State, ctx: GenCtx) => Move[];

export interface Step {
  level: number; move: Move; triggered: Move[];
  before: Figure; after: Figure; cumFE: number;
}
export interface GuideOut {
  mode: 'ideal' | 'advise';
  pin: string;
  etor: { season: string; fetchedAt: string };
  knobs: Record<string, unknown>;
  start: Figure;
  steps: Step[];
  /** configurations not generated because their resolution rule is not ported, by reason */
  notSearched: string[];
  /** acquisitions with no price */
  unpriced: string[];
  /** candidates whose figure stopped or was partial, with the reason */
  notCalculable: string[];
}
