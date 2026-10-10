/* SS13-temp: the page's SS13/SS14 switch (?season=, default SS14). Delete with SS13 —
   removal steps in packages/dmg/src/seasons.ts. Picking a season reloads the page, so
   every module can choose its data once at import time. */
import { parseSeason, type Season } from "@rehan/dmg/seasons";

export const PAGE_SEASON: Season = parseSeason(new URLSearchParams(location.search).get("season"));

// both seasons' JSON share a shape; typed as the SS14 import
export const bySeason = <T>(ss14: T, ss13: unknown): T => (PAGE_SEASON === "ss13" ? ss13 as T : ss14);

export function mountSeasonSwitch(): void {
  const links = document.querySelector(".topnav-links");
  if (!links) return;
  const other: Season = PAGE_SEASON === "ss13" ? "ss14" : "ss13";
  const params = new URLSearchParams(location.search);
  params.set("season", other);
  const a = document.createElement("a");
  a.className = "topnav-cta";
  a.href = `?${params}`;
  a.textContent = `${PAGE_SEASON.toUpperCase()} math · switch to ${other.toUpperCase()}`;
  links.prepend(a);
}
