import "./guide-style.css";
import { renderCalc } from "./calc";
import type { Snapshot } from "@rehan/dmg/damageModel";
import type { SupportGem } from "@rehan/dmg/supports";
import { applySeason } from "@rehan/dmg/seasons";
import bingSnapshot from "./data/bing-snapshot.json";
import supports14 from "./data/supports.json";
import supports13 from "./data/supports.ss13.json";  // SS13-temp
import { bySeason, mountSeasonSwitch, PAGE_SEASON } from "./season";

import { mountBingGuide } from "./bing-guide";

mountSeasonSwitch();

const TABS = ["guide", "buylist", "ladders", "prices", "calc"] as const;
const buttons = [...document.querySelectorAll<HTMLButtonElement>("#tabbar button[data-tab]")];
function show(tab: string): void {
  for (const t of TABS) document.getElementById(`${t}-tab`)!.hidden = t !== tab;
  for (const b of buttons) b.classList.toggle("active", b.dataset.tab === tab);
}
for (const b of buttons) b.addEventListener("click", () => show(b.dataset.tab!));
mountBingGuide({
  guide: document.getElementById("guide")!, buylist: document.getElementById("buylist")!,
  ladders: document.getElementById("ladders")!, prices: document.getElementById("prices")!,
});
const supportsData = bySeason(supports14, supports13);

// HoA is fire; the model's cold_res/cold-pen slots are its elemental res/pen here.
renderCalc(document.getElementById("calc")!, applySeason(bingSnapshot as unknown as Snapshot, PAGE_SEASON), {
  cold_res_pct: "fire res pct",
  cold_pct: "fire pen pct",
  flat_added_erosion_min: "added erosion min",
  flat_added_erosion_max: "added erosion max",
  erosion_res_pct: "erosion res pct",
  erosion_pct: "erosion pen pct",
}, supportsData.supports as SupportGem[]);
