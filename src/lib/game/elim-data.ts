import type { TeamId } from "./types";
import { ELIM_WEEKS } from "./elim-weeks";
import { ELIM_LEGACY_WEEKS } from "./elim-legacy-weeks";
import { ELIM_LEGACY_META } from "./elim-legacy-meta";
import { ELIM_KD } from "./elim-kd";
import { ELIM_LEGACY_KD } from "./elim-legacy-kd";
import { ELIM_SKILL } from "./elim-skill";
import { ELIM_LEGACY_SKILL } from "./elim-legacy-skill";
import { teamBye } from "./elim-byes";

export const ELIM_ERA_YEARS = {
  classic: [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015],
  modern: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
} as const;
export type ElimEra = keyof typeof ELIM_ERA_YEARS;
export const ELIM_YEARS = [...ELIM_ERA_YEARS.classic, ...ELIM_ERA_YEARS.modern] as const;
export type ElimYear = (typeof ELIM_YEARS)[number];
export type ElimModernYear = (typeof ELIM_ERA_YEARS.modern)[number];
export const ELIM_POS = ["QB", "RB", "WR", "TE", "D", "K"] as const;
export type ElimPos = (typeof ELIM_POS)[number];
export const ELIM_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "K", "D"] as const;
export type ElimSlot = (typeof ELIM_SLOTS)[number];
export const ELIM_BUDGET = 35;
export const ELIM_ROUNDS = ELIM_SLOTS.length;

export function isElimSlot(value: string): value is ElimSlot {
  return (ELIM_SLOTS as readonly string[]).includes(value);
}

export function slotPos(slot: ElimSlot): ElimPos {
  if (slot === "RB1" || slot === "RB2") return "RB";
  if (slot === "WR1" || slot === "WR2") return "WR";
  return slot;
}

export function slotLabel(slot: ElimSlot): string {
  return slot;
}

export function weekCount(year: number): number {
  return year >= 2021 ? 18 : 17;
}

/** Late weeks that never match up and never count in season totals. */
export function hiddenWeeks(year: number): number[] {
  return year <= 2020 ? [16, 17, 18] : [17, 18];
}

/** 2006–2020 play weeks 1–15. 2021+ play weeks 1–16. Weeks 17–18 never play. */
export function playableWeeks(year: number): number[] {
  const skip = new Set(hiddenWeeks(year));
  return Array.from({ length: weekCount(year) }, (_, i) => i + 1).filter((week) => !skip.has(week));
}

export type WeekScoreTone = "bye" | "bad" | "ok" | "good" | "best";

/** Weekly PPR bands per position: below bad = red, below good = grey, below best = green, else gold. */
export const WEEK_SCORE_BANDS: Record<ElimPos, readonly [bad: number, good: number, best: number]> = {
  QB: [14, 22, 32],
  RB: [8, 16, 25],
  WR: [8, 16, 25],
  TE: [6, 12, 18],
  K: [6, 10, 14],
  D: [2, 8, 14],
};

export function weekScoreTone(pos: ElimPos, pts: number, bye = false): WeekScoreTone {
  if (bye) return "bye";
  const [bad, good, best] = WEEK_SCORE_BANDS[pos];
  if (pts < bad) return "bad";
  if (pts < good) return "ok";
  if (pts < best) return "good";
  return "best";
}

/** Compact season row: name, team, PPR total. Lists are best → worst (cost 10 → 1). */
type Row = readonly [name: string, team: TeamId, ppr: number];

const POOL: Record<ElimModernYear, Record<ElimPos, readonly Row[]>> = {
  2016: {
    QB: [
      ["Matt Ryan", "ATL", 347.8],
      ["Aaron Rodgers", "GB", 380.0],
      ["Drew Brees", "NO", 336.4],
      ["Andrew Luck", "IND", 330.9],
      ["Kirk Cousins", "WAS", 310.2],
      ["Matthew Stafford", "DET", 305.6],
      ["Derek Carr", "LV", 291.4],
      ["Philip Rivers", "LAC", 289.1],
      ["Ben Roethlisberger", "PIT", 284.6],
      ["Dak Prescott", "DAL", 284.2],
    ],
    RB: [
      ["David Johnson", "ARI", 407.8],
      ["Le'Veon Bell", "PIT", 388.5],
      ["Ezekiel Elliott", "DAL", 331.4],
      ["LeSean McCoy", "BUF", 313.0],
      ["DeMarco Murray", "TEN", 305.8],
      ["Melvin Gordon", "LAC", 296.1],
      ["LeGarrette Blount", "NE", 239.3],
      ["Jordan Howard", "CHI", 236.1],
      ["Jay Ajayi", "MIA", 234.3],
      ["Mark Ingram", "NO", 230.2],
    ],
    WR: [
      ["Antonio Brown", "PIT", 369.3],
      ["Jordy Nelson", "GB", 337.7],
      ["Mike Evans", "TB", 324.1],
      ["Odell Beckham Jr.", "NYG", 316.0],
      ["T.Y. Hilton", "IND", 299.8],
      ["Julio Jones", "ATL", 293.9],
      ["Davante Adams", "GB", 281.7],
      ["Larry Fitzgerald", "ARI", 280.9],
      ["Brandin Cooks", "NO", 280.3],
      ["Doug Baldwin", "SEA", 271.3],
    ],
    TE: [
      ["Travis Kelce", "KC", 223.5],
      ["Greg Olsen", "CAR", 215.3],
      ["Kyle Rudolph", "MIN", 199.0],
      ["Delanie Walker", "TEN", 188.5],
      ["Jimmy Graham", "SEA", 187.2],
      ["Zach Ertz", "PHI", 186.6],
      ["Cameron Brate", "TB", 173.0],
      ["Martellus Bennett", "NE", 172.5],
      ["Jason Witten", "DAL", 171.3],
      ["Dennis Pitta", "BAL", 168.4],
    ],
    D: [
      ["Chiefs", "KC", 176],
      ["Vikings", "MIN", 168],
      ["Broncos", "DEN", 161],
      ["Patriots", "NE", 154],
      ["Cardinals", "ARI", 149],
      ["Seahawks", "SEA", 147],
      ["Eagles", "PHI", 141],
      ["Ravens", "BAL", 138],
      ["Giants", "NYG", 134],
      ["Panthers", "CAR", 129],
    ],
    K: [
      ["Justin Tucker", "BAL", 158],
      ["Matt Bryant", "ATL", 158],
      ["Stephen Gostkowski", "NE", 151],
      ["Dustin Hopkins", "WAS", 150],
      ["Cairo Santos", "KC", 148],
      ["Dan Bailey", "DAL", 145],
      ["Wil Lutz", "NO", 144],
      ["Mason Crosby", "GB", 141],
      ["Adam Vinatieri", "IND", 139],
      ["Nick Novak", "HOU", 135],
    ],
  },
  2017: {
    QB: [
      ["Russell Wilson", "SEA", 354.0],
      ["Cam Newton", "CAR", 330.5],
      ["Tom Brady", "NE", 318.6],
      ["Alex Smith", "KC", 318.0],
      ["Carson Wentz", "PHI", 298.0],
      ["Kirk Cousins", "WAS", 296.8],
      ["Matthew Stafford", "DET", 291.4],
      ["Drew Brees", "NO", 288.0],
      ["Philip Rivers", "LAC", 279.5],
      ["Dak Prescott", "DAL", 274.2],
    ],
    RB: [
      ["Todd Gurley", "LAR", 383.3],
      ["Le'Veon Bell", "PIT", 341.6],
      ["Alvin Kamara", "NO", 348.2],
      ["Kareem Hunt", "KC", 295.2],
      ["Melvin Gordon", "LAC", 288.1],
      ["Mark Ingram", "NO", 278.0],
      ["LeSean McCoy", "BUF", 263.0],
      ["Jordan Howard", "CHI", 246.5],
      ["Leonard Fournette", "JAX", 244.0],
      ["Ezekiel Elliott", "DAL", 229.1],
    ],
    WR: [
      ["Antonio Brown", "PIT", 349.3],
      ["DeAndre Hopkins", "HOU", 338.8],
      ["Keenan Allen", "LAC", 316.2],
      ["Larry Fitzgerald", "ARI", 287.4],
      ["Jarvis Landry", "MIA", 286.0],
      ["Julio Jones", "ATL", 284.9],
      ["Adam Thielen", "MIN", 281.7],
      ["Michael Thomas", "NO", 277.5],
      ["Tyreek Hill", "KC", 271.2],
      ["A.J. Green", "CIN", 267.8],
    ],
    TE: [
      ["Rob Gronkowski", "NE", 237.2],
      ["Travis Kelce", "KC", 233.5],
      ["Zach Ertz", "PHI", 224.4],
      ["Jimmy Graham", "SEA", 172.0],
      ["Jack Doyle", "IND", 171.5],
      ["Kyle Rudolph", "MIN", 170.0],
      ["Evan Engram", "NYG", 169.6],
      ["Delanie Walker", "TEN", 163.8],
      ["Cameron Brate", "TB", 151.0],
      ["Jason Witten", "DAL", 150.2],
    ],
    D: [
      ["Jaguars", "JAX", 184],
      ["Ravens", "BAL", 168],
      ["Eagles", "PHI", 162],
      ["Rams", "LAR", 157],
      ["Vikings", "MIN", 155],
      ["Chargers", "LAC", 149],
      ["Broncos", "DEN", 146],
      ["Seahawks", "SEA", 142],
      ["Panthers", "CAR", 138],
      ["Patriots", "NE", 134],
    ],
    K: [
      ["Greg Zuerlein", "LAR", 178],
      ["Stephen Gostkowski", "NE", 156],
      ["Matt Bryant", "ATL", 155],
      ["Justin Tucker", "BAL", 153],
      ["Wil Lutz", "NO", 151],
      ["Harrison Butker", "KC", 150],
      ["Matt Prater", "DET", 146],
      ["Chris Boswell", "PIT", 142],
      ["Kai Forbath", "MIN", 141],
      ["Robbie Gould", "SF", 139],
    ],
  },
  2018: {
    QB: [
      ["Patrick Mahomes", "KC", 417.1],
      ["Matt Ryan", "ATL", 353.5],
      ["Ben Roethlisberger", "PIT", 341.9],
      ["Deshaun Watson", "HOU", 331.7],
      ["Andrew Luck", "IND", 327.5],
      ["Jared Goff", "LAR", 317.3],
      ["Drew Brees", "NO", 312.0],
      ["Russell Wilson", "SEA", 300.6],
      ["Aaron Rodgers", "GB", 312.5],
      ["Kirk Cousins", "MIN", 288.4],
    ],
    RB: [
      ["Saquon Barkley", "NYG", 385.8],
      ["Christian McCaffrey", "CAR", 385.5],
      ["Alvin Kamara", "NO", 354.2],
      ["Todd Gurley", "LAR", 344.4],
      ["Ezekiel Elliott", "DAL", 331.1],
      ["Melvin Gordon", "LAC", 288.5],
      ["James Conner", "PIT", 280.0],
      ["Kareem Hunt", "KC", 243.2],
      ["Joe Mixon", "CIN", 241.9],
      ["Phillip Lindsay", "DEN", 238.8],
    ],
    WR: [
      ["Tyreek Hill", "KC", 334.0],
      ["DeAndre Hopkins", "HOU", 333.5],
      ["Davante Adams", "GB", 329.6],
      ["Julio Jones", "ATL", 329.9],
      ["Antonio Brown", "PIT", 323.7],
      ["Michael Thomas", "NO", 317.2],
      ["Adam Thielen", "MIN", 312.8],
      ["JuJu Smith-Schuster", "PIT", 288.7],
      ["Mike Evans", "TB", 286.4],
      ["Keenan Allen", "LAC", 278.1],
    ],
    TE: [
      ["Travis Kelce", "KC", 294.0],
      ["Zach Ertz", "PHI", 280.3],
      ["George Kittle", "SF", 233.7],
      ["Eric Ebron", "IND", 207.2],
      ["Jared Cook", "LV", 180.2],
      ["Austin Hooper", "ATL", 168.0],
      ["David Njoku", "CLE", 151.5],
      ["Kyle Rudolph", "MIN", 151.0],
      ["Jimmy Graham", "GB", 147.6],
      ["O.J. Howard", "TB", 146.2],
    ],
    D: [
      ["Bears", "CHI", 185],
      ["Ravens", "BAL", 168],
      ["Texans", "HOU", 162],
      ["Vikings", "MIN", 157],
      ["Jaguars", "JAX", 152],
      ["Rams", "LAR", 148],
      ["Seahawks", "SEA", 144],
      ["Broncos", "DEN", 141],
      ["Patriots", "NE", 138],
      ["Colts", "IND", 134],
    ],
    K: [
      ["Ka'imi Fairbairn", "HOU", 160],
      ["Justin Tucker", "BAL", 157],
      ["Wil Lutz", "NO", 156],
      ["Harrison Butker", "KC", 154],
      ["Aldrick Rosas", "NYG", 150],
      ["Mason Crosby", "GB", 149],
      ["Jason Myers", "NYJ", 147],
      ["Greg Zuerlein", "LAR", 146],
      ["Stephen Gostkowski", "NE", 144],
      ["Robbie Gould", "SF", 141],
    ],
  },
  2019: {
    QB: [
      ["Lamar Jackson", "BAL", 421.7],
      ["Dak Prescott", "DAL", 348.8],
      ["Russell Wilson", "SEA", 333.6],
      ["Deshaun Watson", "HOU", 332.0],
      ["Jameis Winston", "TB", 321.3],
      ["Patrick Mahomes", "KC", 289.4],
      ["Aaron Rodgers", "GB", 278.4],
      ["Carson Wentz", "PHI", 277.0],
      ["Matt Ryan", "ATL", 276.4],
      ["Kirk Cousins", "MIN", 269.3],
    ],
    RB: [
      ["Christian McCaffrey", "CAR", 471.2],
      ["Aaron Jones", "GB", 314.8],
      ["Austin Ekeler", "LAC", 309.0],
      ["Dalvin Cook", "MIN", 292.4],
      ["Ezekiel Elliott", "DAL", 284.7],
      ["Derrick Henry", "TEN", 276.6],
      ["Nick Chubb", "CLE", 255.2],
      ["Leonard Fournette", "JAX", 259.4],
      ["Chris Carson", "SEA", 232.8],
      ["Mark Ingram", "BAL", 230.5],
    ],
    WR: [
      ["Michael Thomas", "NO", 374.6],
      ["Chris Godwin", "TB", 303.7],
      ["Cooper Kupp", "LAR", 300.5],
      ["Julio Jones", "ATL", 299.1],
      ["DeAndre Hopkins", "HOU", 287.7],
      ["Kenny Golladay", "DET", 278.0],
      ["Keenan Allen", "LAC", 277.5],
      ["Julian Edelman", "NE", 276.3],
      ["Mike Evans", "TB", 274.7],
      ["Amari Cooper", "DAL", 274.5],
    ],
    TE: [
      ["Travis Kelce", "KC", 254.3],
      ["Darren Waller", "LV", 251.0],
      ["Zach Ertz", "PHI", 235.3],
      ["Mark Andrews", "BAL", 217.2],
      ["George Kittle", "SF", 212.5],
      ["Austin Hooper", "ATL", 201.7],
      ["Hunter Henry", "LAC", 177.7],
      ["Jared Cook", "NO", 175.5],
      ["Tyler Higbee", "LAR", 164.4],
      ["Dallas Goedert", "PHI", 153.7],
    ],
    D: [
      ["Patriots", "NE", 191],
      ["49ers", "SF", 176],
      ["Steelers", "PIT", 168],
      ["Ravens", "BAL", 162],
      ["Bills", "BUF", 157],
      ["Vikings", "MIN", 151],
      ["Rams", "LAR", 147],
      ["Chiefs", "KC", 143],
      ["Saints", "NO", 140],
      ["Bears", "CHI", 136],
    ],
    K: [
      ["Harrison Butker", "KC", 167],
      ["Wil Lutz", "NO", 160],
      ["Justin Tucker", "BAL", 159],
      ["Matt Gay", "TB", 156],
      ["Josh Lambo", "JAX", 154],
      ["Zane Gonzalez", "ARI", 151],
      ["Matt Prater", "DET", 149],
      ["Chris Boswell", "PIT", 147],
      ["Younghoe Koo", "ATL", 145],
      ["Robbie Gould", "SF", 143],
    ],
  },
  2020: {
    QB: [
      ["Josh Allen", "BUF", 405.1],
      ["Aaron Rodgers", "GB", 386.2],
      ["Kyler Murray", "ARI", 390.7],
      ["Patrick Mahomes", "KC", 374.4],
      ["Deshaun Watson", "HOU", 373.0],
      ["Russell Wilson", "SEA", 365.8],
      ["Ryan Tannehill", "TEN", 343.4],
      ["Lamar Jackson", "BAL", 332.8],
      ["Tom Brady", "TB", 337.9],
      ["Kirk Cousins", "MIN", 319.2],
    ],
    RB: [
      ["Alvin Kamara", "NO", 377.8],
      ["Dalvin Cook", "MIN", 337.8],
      ["Derrick Henry", "TEN", 323.1],
      ["Aaron Jones", "GB", 258.9],
      ["David Montgomery", "CHI", 266.4],
      ["James Robinson", "JAX", 253.4],
      ["Jonathan Taylor", "IND", 253.8],
      ["Ezekiel Elliott", "DAL", 227.7],
      ["Nick Chubb", "CLE", 215.3],
      ["Kareem Hunt", "CLE", 212.8],
    ],
    WR: [
      ["Davante Adams", "GB", 358.4],
      ["Tyreek Hill", "KC", 328.9],
      ["Stefon Diggs", "BUF", 328.6],
      ["DeAndre Hopkins", "ARI", 327.8],
      ["Calvin Ridley", "ATL", 281.5],
      ["DK Metcalf", "SEA", 273.3],
      ["Justin Jefferson", "MIN", 274.2],
      ["Allen Robinson", "CHI", 270.9],
      ["Keenan Allen", "LAC", 269.1],
      ["Adam Thielen", "MIN", 265.0],
    ],
    TE: [
      ["Travis Kelce", "KC", 312.8],
      ["Darren Waller", "LV", 279.1],
      ["George Kittle", "SF", 164.1],
      ["Mark Andrews", "BAL", 176.1],
      ["T.J. Hockenson", "DET", 175.3],
      ["Logan Thomas", "WAS", 173.6],
      ["Mike Gesicki", "MIA", 172.3],
      ["Noah Fant", "DEN", 171.3],
      ["Hayden Hurst", "ATL", 163.1],
      ["Robert Tonyan", "GB", 163.6],
    ],
    D: [
      ["Rams", "LAR", 168],
      ["Steelers", "PIT", 166],
      ["Colts", "IND", 162],
      ["Dolphins", "MIA", 158],
      ["Ravens", "BAL", 154],
      ["Washington", "WAS", 151],
      ["Saints", "NO", 148],
      ["Buccaneers", "TB", 145],
      ["Giants", "NYG", 141],
      ["Bills", "BUF", 138],
    ],
    K: [
      ["Younghoe Koo", "ATL", 161],
      ["Daniel Carlson", "LV", 156],
      ["Tyler Bass", "BUF", 154],
      ["Jason Sanders", "MIA", 154],
      ["Rodrigo Blankenship", "IND", 151],
      ["Justin Tucker", "BAL", 149],
      ["Ryan Succop", "TB", 148],
      ["Harrison Butker", "KC", 147],
      ["Graham Gano", "NYG", 144],
      ["Wil Lutz", "NO", 142],
    ],
  },
  2021: {
    QB: [
      ["Josh Allen", "BUF", 417.7],
      ["Justin Herbert", "LAC", 395.6],
      ["Tom Brady", "TB", 386.7],
      ["Patrick Mahomes", "KC", 374.0],
      ["Matthew Stafford", "LAR", 346.7],
      ["Aaron Rodgers", "GB", 333.3],
      ["Dak Prescott", "DAL", 330.6],
      ["Joe Burrow", "CIN", 326.7],
      ["Jalen Hurts", "PHI", 326.0],
      ["Kirk Cousins", "MIN", 314.3],
    ],
    RB: [
      ["Jonathan Taylor", "IND", 373.1],
      ["Austin Ekeler", "LAC", 343.8],
      ["Joe Mixon", "CIN", 287.9],
      ["Najee Harris", "PIT", 300.1],
      ["James Conner", "ARI", 257.7],
      ["Antonio Gibson", "WAS", 229.1],
      ["Ezekiel Elliott", "DAL", 226.6],
      ["Nick Chubb", "CLE", 228.4],
      ["Alvin Kamara", "NO", 234.7],
      ["Leonard Fournette", "TB", 253.6],
    ],
    WR: [
      ["Cooper Kupp", "LAR", 439.5],
      ["Davante Adams", "GB", 344.3],
      ["Justin Jefferson", "MIN", 330.4],
      ["Tyreek Hill", "KC", 296.5],
      ["Stefon Diggs", "BUF", 311.5],
      ["Ja'Marr Chase", "CIN", 304.6],
      ["Deebo Samuel", "SF", 330.0],
      ["Mike Evans", "TB", 262.5],
      ["Diontae Johnson", "PIT", 269.4],
      ["Keenan Allen", "LAC", 257.8],
    ],
    TE: [
      ["Mark Andrews", "BAL", 301.1],
      ["Travis Kelce", "KC", 262.8],
      ["Dalton Schultz", "DAL", 208.8],
      ["George Kittle", "SF", 198.0],
      ["Rob Gronkowski", "TB", 178.6],
      ["Kyle Pitts", "ATL", 176.6],
      ["Dallas Goedert", "PHI", 170.0],
      ["T.J. Hockenson", "DET", 162.3],
      ["Zach Ertz", "ARI", 162.7],
      ["Mike Gesicki", "MIA", 157.4],
    ],
    D: [
      ["Cowboys", "DAL", 178],
      ["Bills", "BUF", 168],
      ["Patriots", "NE", 165],
      ["Saints", "NO", 158],
      ["Buccaneers", "TB", 154],
      ["Dolphins", "MIA", 151],
      ["Titans", "TEN", 148],
      ["49ers", "SF", 145],
      ["Packers", "GB", 141],
      ["Steelers", "PIT", 138],
    ],
    K: [
      ["Daniel Carlson", "LV", 163],
      ["Nick Folk", "NE", 156],
      ["Justin Tucker", "BAL", 156],
      ["Matt Gay", "LAR", 153],
      ["Chris Boswell", "PIT", 149],
      ["Ryan Succop", "TB", 147],
      ["Matt Prater", "ARI", 146],
      ["Greg Joseph", "MIN", 144],
      ["Tyler Bass", "BUF", 143],
      ["Harrison Butker", "KC", 141],
    ],
  },
  2022: {
    QB: [
      ["Patrick Mahomes", "KC", 428.4],
      ["Josh Allen", "BUF", 412.4],
      ["Jalen Hurts", "PHI", 378.0],
      ["Joe Burrow", "CIN", 350.7],
      ["Geno Smith", "SEA", 317.8],
      ["Justin Herbert", "LAC", 317.1],
      ["Daniel Jones", "NYG", 300.1],
      ["Kirk Cousins", "MIN", 310.4],
      ["Trevor Lawrence", "JAX", 299.6],
      ["Tua Tagovailoa", "MIA", 295.0],
    ],
    RB: [
      ["Austin Ekeler", "LAC", 372.7],
      ["Christian McCaffrey", "SF", 356.4],
      ["Derrick Henry", "TEN", 302.8],
      ["Josh Jacobs", "LV", 328.3],
      ["Saquon Barkley", "NYG", 284.0],
      ["Nick Chubb", "CLE", 265.4],
      ["Tony Pollard", "DAL", 272.8],
      ["Dalvin Cook", "MIN", 237.3],
      ["Aaron Jones", "GB", 229.6],
      ["Rhamondre Stevenson", "NE", 222.1],
    ],
    WR: [
      ["Justin Jefferson", "MIN", 368.7],
      ["Tyreek Hill", "MIA", 376.2],
      ["Davante Adams", "LV", 335.5],
      ["Stefon Diggs", "BUF", 316.6],
      ["A.J. Brown", "PHI", 299.6],
      ["CeeDee Lamb", "DAL", 313.2],
      ["Amon-Ra St. Brown", "DET", 266.6],
      ["Jaylen Waddle", "MIA", 259.2],
      ["Amari Cooper", "CLE", 247.0],
      ["Christian Kirk", "JAX", 241.9],
    ],
    TE: [
      ["Travis Kelce", "KC", 331.3],
      ["T.J. Hockenson", "MIN", 210.4],
      ["George Kittle", "SF", 189.5],
      ["Mark Andrews", "BAL", 169.5],
      ["Cole Kmet", "CHI", 163.3],
      ["Pat Freiermuth", "PIT", 161.4],
      ["Tyler Higbee", "LAR", 160.0],
      ["Dalton Schultz", "DAL", 156.8],
      ["Evan Engram", "JAX", 154.3],
      ["Gerald Everett", "LAC", 152.4],
    ],
    D: [
      ["49ers", "SF", 184],
      ["Cowboys", "DAL", 172],
      ["Eagles", "PHI", 168],
      ["Patriots", "NE", 161],
      ["Bills", "BUF", 157],
      ["Commanders", "WAS", 152],
      ["Ravens", "BAL", 148],
      ["Jets", "NYJ", 145],
      ["Chiefs", "KC", 141],
      ["Steelers", "PIT", 138],
    ],
    K: [
      ["Justin Tucker", "BAL", 160],
      ["Daniel Carlson", "LV", 157],
      ["Brett Maher", "DAL", 156],
      ["Jason Myers", "SEA", 153],
      ["Eddy Pineiro", "CAR", 151],
      ["Younghoe Koo", "ATL", 149],
      ["Graham Gano", "NYG", 147],
      ["Nick Folk", "NE", 145],
      ["Riley Patterson", "JAX", 143],
      ["Tyler Bass", "BUF", 141],
    ],
  },
  2023: {
    QB: [
      ["Josh Allen", "BUF", 392.6],
      ["Jalen Hurts", "PHI", 356.8],
      ["Dak Prescott", "DAL", 342.6],
      ["Lamar Jackson", "BAL", 331.2],
      ["Jordan Love", "GB", 319.1],
      ["Brock Purdy", "SF", 310.0],
      ["Tua Tagovailoa", "MIA", 298.0],
      ["Patrick Mahomes", "KC", 287.6],
      ["Jared Goff", "DET", 284.3],
      ["C.J. Stroud", "HOU", 298.0],
    ],
    RB: [
      ["Christian McCaffrey", "SF", 391.3],
      ["Breece Hall", "NYJ", 290.1],
      ["Travis Etienne", "JAX", 273.4],
      ["Rachaad White", "TB", 267.6],
      ["Kyren Williams", "LAR", 255.2],
      ["Raheem Mostert", "MIA", 253.7],
      ["Jahmyr Gibbs", "DET", 247.1],
      ["David Montgomery", "DET", 244.2],
      ["James Cook", "BUF", 233.7],
      ["Alvin Kamara", "NO", 232.8],
    ],
    WR: [
      ["CeeDee Lamb", "DAL", 403.2],
      ["Tyreek Hill", "MIA", 376.4],
      ["Amon-Ra St. Brown", "DET", 330.9],
      ["Mike Evans", "TB", 298.5],
      ["Puka Nacua", "LAR", 298.5],
      ["A.J. Brown", "PHI", 289.6],
      ["DJ Moore", "CHI", 286.5],
      ["Nico Collins", "HOU", 280.4],
      ["Keenan Allen", "LAC", 278.9],
      ["Stefon Diggs", "BUF", 272.8],
    ],
    TE: [
      ["Sam LaPorta", "DET", 239.3],
      ["Travis Kelce", "KC", 219.4],
      ["T.J. Hockenson", "MIN", 207.4],
      ["George Kittle", "SF", 204.2],
      ["Evan Engram", "JAX", 187.8],
      ["David Njoku", "CLE", 186.2],
      ["Cole Kmet", "CHI", 174.7],
      ["Jake Ferguson", "DAL", 171.1],
      ["Trey McBride", "ARI", 168.5],
      ["Dalton Kincaid", "BUF", 163.2],
    ],
    D: [
      ["Ravens", "BAL", 178],
      ["Browns", "CLE", 172],
      ["Cowboys", "DAL", 168],
      ["Jets", "NYJ", 161],
      ["49ers", "SF", 157],
      ["Bills", "BUF", 152],
      ["Chiefs", "KC", 148],
      ["Dolphins", "MIA", 144],
      ["Steelers", "PIT", 141],
      ["Saints", "NO", 137],
    ],
    K: [
      ["Brandon Aubrey", "DAL", 175],
      ["Jake Elliott", "PHI", 158],
      ["Jason Myers", "SEA", 156],
      ["Harrison Butker", "KC", 154],
      ["Dustin Hopkins", "CLE", 152],
      ["Younghoe Koo", "ATL", 150],
      ["Cameron Dicker", "LAC", 148],
      ["Matt Gay", "IND", 146],
      ["Wil Lutz", "DEN", 144],
      ["Justin Tucker", "BAL", 142],
    ],
  },
  2024: {
    QB: [
      ["Lamar Jackson", "BAL", 434.4],
      ["Josh Allen", "BUF", 385.1],
      ["Joe Burrow", "CIN", 381.9],
      ["Baker Mayfield", "TB", 381.8],
      ["Jayden Daniels", "WAS", 364.7],
      ["Jared Goff", "DET", 336.5],
      ["Bo Nix", "DEN", 329.1],
      ["Jalen Hurts", "PHI", 320.0],
      ["Sam Darnold", "MIN", 319.8],
      ["Kyler Murray", "ARI", 308.4],
    ],
    RB: [
      ["Saquon Barkley", "PHI", 355.3],
      ["Bijan Robinson", "ATL", 341.8],
      ["Jahmyr Gibbs", "DET", 362.0],
      ["Derrick Henry", "BAL", 336.4],
      ["Kyren Williams", "LAR", 299.0],
      ["De'Von Achane", "MIA", 301.0],
      ["Josh Jacobs", "GB", 293.0],
      ["Chase Brown", "CIN", 268.0],
      ["James Cook", "BUF", 264.0],
      ["Bucky Irving", "TB", 258.0],
    ],
    WR: [
      ["Ja'Marr Chase", "CIN", 403.0],
      ["Justin Jefferson", "MIN", 319.0],
      ["Amon-Ra St. Brown", "DET", 316.0],
      ["CeeDee Lamb", "DAL", 312.0],
      ["Nico Collins", "HOU", 280.0],
      ["Brian Thomas Jr.", "JAX", 284.0],
      ["A.J. Brown", "PHI", 265.0],
      ["Drake London", "ATL", 268.0],
      ["Mike Evans", "TB", 259.0],
      ["Malik Nabers", "NYG", 256.0],
    ],
    TE: [
      ["Brock Bowers", "LV", 262.7],
      ["George Kittle", "SF", 250.4],
      ["Trey McBride", "ARI", 229.8],
      ["Jonnu Smith", "MIA", 206.0],
      ["Travis Kelce", "KC", 183.4],
      ["Mark Andrews", "BAL", 176.0],
      ["Sam LaPorta", "DET", 172.0],
      ["David Njoku", "CLE", 168.0],
      ["Pat Freiermuth", "PIT", 164.0],
      ["Hunter Henry", "NE", 158.0],
    ],
    D: [
      ["Vikings", "MIN", 176],
      ["Broncos", "DEN", 172],
      ["Eagles", "PHI", 168],
      ["Packers", "GB", 161],
      ["Steelers", "PIT", 157],
      ["Chargers", "LAC", 152],
      ["Texans", "HOU", 148],
      ["Lions", "DET", 144],
      ["Seahawks", "SEA", 141],
      ["Ravens", "BAL", 137],
    ],
    K: [
      ["Brandon Aubrey", "DAL", 172],
      ["Chris Boswell", "PIT", 162],
      ["Cameron Dicker", "LAC", 158],
      ["Jake Bates", "DET", 156],
      ["Ka'imi Fairbairn", "HOU", 154],
      ["Chase McLaughlin", "TB", 152],
      ["Jason Myers", "SEA", 149],
      ["Wil Lutz", "DEN", 147],
      ["Tyler Bass", "BUF", 144],
      ["Younghoe Koo", "ATL", 141],
    ],
  },
  2025: {
    QB: [
      ["Josh Allen", "BUF", 374.5],
      ["Drake Maye", "NE", 359.9],
      ["Matthew Stafford", "LAR", 358.3],
      ["Trevor Lawrence", "JAX", 350.1],
      ["Caleb Williams", "CHI", 325.3],
      ["Dak Prescott", "DAL", 323.8],
      ["Bo Nix", "DEN", 315.8],
      ["Jared Goff", "DET", 305.1],
      ["Jalen Hurts", "PHI", 305.0],
      ["Justin Herbert", "LAC", 299.8],
    ],
    RB: [
      ["Christian McCaffrey", "SF", 416.6],
      ["Bijan Robinson", "ATL", 370.8],
      ["Jahmyr Gibbs", "DET", 366.9],
      ["Jonathan Taylor", "IND", 362.3],
      ["De'Von Achane", "MIA", 322.8],
      ["James Cook", "BUF", 302.2],
      ["Chase Brown", "CIN", 282.6],
      ["Derrick Henry", "BAL", 279.5],
      ["Kyren Williams", "LAR", 263.3],
      ["Travis Etienne", "JAX", 253.9],
    ],
    WR: [
      ["Puka Nacua", "LAR", 375.0],
      ["Jaxon Smith-Njigba", "SEA", 359.9],
      ["Amon-Ra St. Brown", "DET", 324.0],
      ["Ja'Marr Chase", "CIN", 313.6],
      ["George Pickens", "DAL", 291.9],
      ["Chris Olave", "NO", 269.0],
      ["Zay Flowers", "BAL", 243.3],
      ["Nico Collins", "HOU", 226.2],
      ["Davante Adams", "LAR", 222.9],
      ["Michael Wilson", "ARI", 220.6],
    ],
    TE: [
      ["Trey McBride", "ARI", 315.9],
      ["Kyle Pitts", "ATL", 210.8],
      ["Travis Kelce", "KC", 193.2],
      ["Tyler Warren", "IND", 188.5],
      ["Jake Ferguson", "DAL", 188.1],
      ["Harold Fannin", "CLE", 186.4],
      ["Dallas Goedert", "PHI", 185.1],
      ["Juwan Johnson", "NO", 179.9],
      ["Hunter Henry", "NE", 178.8],
      ["Dalton Schultz", "HOU", 177.7],
    ],
    D: [
      ["Seahawks", "SEA", 179],
      ["Texans", "HOU", 164],
      ["Jaguars", "JAX", 144],
      ["Broncos", "DEN", 143],
      ["Vikings", "MIN", 136],
      ["Rams", "LAR", 136],
      ["Eagles", "PHI", 135],
      ["Browns", "CLE", 133],
      ["Steelers", "PIT", 130],
      ["Patriots", "NE", 127],
    ],
    K: [
      ["Jason Myers", "SEA", 202],
      ["Ka'imi Fairbairn", "HOU", 194],
      ["Brandon Aubrey", "DAL", 188],
      ["Cameron Dicker", "LAC", 170],
      ["Cam Little", "JAX", 164],
      ["Will Reichard", "MIN", 159],
      ["Chase McLaughlin", "TB", 156],
      ["Jake Bates", "DET", 152],
      ["Chris Boswell", "PIT", 151],
      ["Harrison Butker", "KC", 149],
    ],
  },
};

export interface ElimPlayer {
  id: string;
  name: string;
  pos: ElimPos;
  team: TeamId;
  cost: number;
  ppr: number;
  weeks: number[];
  bye: number;
  vs?: TeamId;
  blocked?: boolean;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function weeksFor(id: string, year: number): number[] {
  const raw = ELIM_WEEKS[id] ?? ELIM_LEGACY_WEEKS[id] ?? [];
  const skip = new Set(hiddenWeeks(year));
  return Array.from({ length: weekCount(year) }, (_, i) => {
    const week = i + 1;
    if (skip.has(week)) return 0;
    return raw[i] ?? 0;
  });
}

function playablePpr(weeks: number[], year: number): number {
  let sum = 0;
  for (const week of playableWeeks(year)) sum += weeks[week - 1] ?? 0;
  return Math.round(sum * 10) / 10;
}

function spreadRows(rows: Row[], n: number): Row[] {
  if (rows.length <= n) return rows;
  const out: Row[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let idx = Math.round((i * (rows.length - 1)) / (n - 1));
    while (used.has(idx) && idx < rows.length - 1) idx += 1;
    used.add(idx);
    out.push(rows[idx]!);
  }
  return out;
}

function boardRows(year: ElimYear, pos: ElimPos): readonly Row[] {
  if (pos === "K" || pos === "D") {
    return (ELIM_KD[year] ?? ELIM_LEGACY_KD[year])[pos];
  }
  if (pos === "TE") {
    const skillTe = ELIM_SKILL[year]?.TE;
    if (skillTe) return skillTe;
    const legacy = ELIM_LEGACY_SKILL[year];
    if (legacy) return legacy.TE;
    return POOL[year as ElimModernYear].TE;
  }
  return (ELIM_SKILL[year] ?? ELIM_LEGACY_SKILL[year])[pos];
}

export function buildSeason(year: ElimYear): Record<ElimPos, ElimPlayer[]> {
  const out = {} as Record<ElimPos, ElimPlayer[]>;
  for (const pos of ELIM_POS) {
    const stream = pos === "K" || pos === "D";
    const source = boardRows(year, pos);
    const ranked = stream || pos !== "TE" || Boolean(ELIM_LEGACY_SKILL[year])
      ? [...source]
      : [...source].sort((a, b) => b[2] - a[2]);
    const rows = stream ? spreadRows(ranked, 5) : ranked.slice(0, 10);
    const topCost = stream ? 5 : 10;
    out[pos] = rows
      .map((row) => {
        const [name, team] = row;
        const id = `e:${year}:${pos}:${slug(name)}`;
        const weeks = weeksFor(id, year);
        return {
          id,
          name,
          pos,
          team,
          cost: topCost,
          ppr: playablePpr(weeks, year),
          weeks,
          bye: teamBye(year, team),
        };
      })
      .sort((a, b) => b.ppr - a.ppr)
      .map((player, i) => ({ ...player, cost: topCost - i }));
  }
  return out;
}

export function playerById(id: string): ElimPlayer | null {
  const match = /^e:(\d{4}):(QB|RB|WR|TE|D|K):(.+)$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  if (!isElimYear(year)) return null;
  const pos = match[2] as ElimPos;
  const board = buildSeason(year)[pos];
  const hit = board.find((row) => row.id === id);
  if (hit) return hit;
  const meta = ELIM_LEGACY_META[id];
  const source = boardRows(year, pos);
  const row = source.find((item) => `e:${year}:${pos}:${slug(item[0])}` === id);
  const weeks = weeksFor(id, year);
  const name = meta?.[0] ?? row?.[0];
  const team = meta?.[1] ?? row?.[1];
  if (name && team) {
    return {
      id,
      name,
      pos,
      team,
      cost: 1,
      ppr: playablePpr(weeks, year),
      weeks,
      bye: teamBye(year, team),
    };
  }
  const label = match[3]
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    id,
    name: label || id,
    pos,
    team: board[0]?.team ?? "NE",
    cost: 1,
    ppr: playablePpr(weeks, year),
    weeks,
    bye: 0,
  };
}

export function isElimEra(value: string): value is ElimEra {
  return value === "classic" || value === "modern";
}

export function randomYear(era: ElimEra = "modern"): ElimYear {
  const years = ELIM_ERA_YEARS[era];
  return years[Math.floor(Math.random() * years.length)]!;
}

export function randomWeek(year: number): number {
  const weeks = playableWeeks(year);
  return weeks[Math.floor(Math.random() * weeks.length)]!;
}

export function unusedWeek(year: number, used: number[]): number {
  const open = playableWeeks(year).filter((week) => !used.includes(week));
  if (open.length === 0) return randomWeek(year);
  return open[Math.floor(Math.random() * open.length)]!;
}

export function isElimYear(value: number): value is ElimYear {
  return (ELIM_YEARS as readonly number[]).includes(value);
}
