import "./guide-style.css";
import { renderCalc } from "./calc";
import type { Snapshot } from "@rehan/dmg/damageModel";
import type { SupportGem } from "@rehan/dmg/supports";
import { applySeason } from "@rehan/dmg/seasons";
import bingSnapshot from "./data/bing-snapshot.json";
import supports14 from "./data/supports.json";
import supports13 from "./data/supports.ss13.json";  // SS13-temp
import { bySeason, mountSeasonSwitch, PAGE_SEASON } from "./season";

mountSeasonSwitch();
const supportsData = bySeason(supports14, supports13);

// Only the DPS Calc — no HoA build data exists yet to generate the other tabs from.
// HoA is fire; the model's cold_res/cold-pen slots are its elemental res/pen here.
renderCalc(document.getElementById("calc")!, applySeason(bingSnapshot as unknown as Snapshot, PAGE_SEASON), {
  cold_res_pct: "fire res pct",
  cold_pct: "fire pen pct",
  flat_added_erosion_min: "added erosion min",
  flat_added_erosion_max: "added erosion max",
  erosion_res_pct: "erosion res pct",
  erosion_pct: "erosion pen pct",
}, supportsData.supports as SupportGem[]);
