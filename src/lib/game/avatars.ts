export const BOX_COST = 3;
export const GOLDEN_COST = 100;
export const WIN_PAY = 1;

export const AVATARS = [
  { id: "poor", name: "Broke", src: "/avatars/poor.jpg?v=3" },
  { id: "holy", name: "White Shirt", src: "/avatars/holy.jpg?v=3", shirt: "white" as const },
  { id: "holy-red", name: "Red Shirt", src: "/avatars/holy-red.jpg?v=1", shirt: "red" as const },
  { id: "holy-blue", name: "Blue Shirt", src: "/avatars/holy-blue.jpg?v=1", shirt: "blue" as const },
  { id: "farmer", name: "Farmer", src: "/avatars/farmer.jpg?v=1" },
  { id: "vampire", name: "Vampire", src: "/avatars/vampire.jpg?v=1" },
  { id: "pirate", name: "Pirate", src: "/avatars/pirate.jpg?v=1" },
  { id: "ninja", name: "Ninja", src: "/avatars/ninja.jpg?v=1" },
  { id: "wizard", name: "Wizard", src: "/avatars/wizard.jpg?v=1" },
  { id: "cyborg", name: "Cyborg", src: "/avatars/cyborg.jpg?v=1" },
  { id: "superhero", name: "Superhero", src: "/avatars/superhero.jpg?v=1" },
  { id: "zombie", name: "Zombie", src: "/avatars/zombie.jpg?v=1" },
  { id: "detective", name: "Detective", src: "/avatars/detective.jpg?v=1" },
  { id: "chef", name: "Chef", src: "/avatars/chef.jpg?v=1" },
  { id: "scientist", name: "Mad Scientist", src: "/avatars/scientist.jpg?v=1" },
  { id: "viking", name: "Viking", src: "/avatars/viking.jpg?v=1" },
  { id: "samurai", name: "Samurai", src: "/avatars/samurai.jpg?v=1" },
  { id: "pharaoh", name: "Pharaoh", src: "/avatars/pharaoh.jpg?v=1" },
  { id: "gladiator", name: "Gladiator", src: "/avatars/gladiator.jpg?v=1" },
  { id: "agent", name: "Secret Agent", src: "/avatars/agent.jpg?v=1" },
  { id: "pilot", name: "Fighter Pilot", src: "/avatars/pilot.jpg?v=1" },
  { id: "lumberjack", name: "Lumberjack", src: "/avatars/lumberjack.jpg?v=1" },
  { id: "rockstar", name: "Rockstar", src: "/avatars/rockstar.jpg?v=1" },
  { id: "astronaut", name: "Astronaut", src: "/avatars/astronaut.jpg?v=1" },
  { id: "cowboy", name: "Cowboy", src: "/avatars/cowboy.jpg?v=1" },
  { id: "knight", name: "Knight", src: "/avatars/knight.jpg?v=2" },
  { id: "supervillain", name: "Supervillain", src: "/avatars/supervillain.jpg?v=1" },
  { id: "alien", name: "Alien", src: "/avatars/alien.jpg?v=1" },
  { id: "werewolf", name: "Werewolf", src: "/avatars/werewolf.jpg?v=2" },
  { id: "reaper", name: "Grim Reaper", src: "/avatars/reaper.jpg?v=1" },
  { id: "santa", name: "Santa", src: "/avatars/santa.jpg?v=2" },
  { id: "leprechaun", name: "Leprechaun", src: "/avatars/leprechaun.jpg?v=1" },
  { id: "sumo", name: "Sumo Wrestler", src: "/avatars/sumo.jpg?v=1" },
  { id: "scuba", name: "Scuba Diver", src: "/avatars/scuba.jpg?v=1" },
  { id: "hacker", name: "Hacker", src: "/avatars/hacker.jpg?v=1" },
  { id: "hotdog", name: "Hot Dog", src: "/avatars/hotdog.jpg?v=2" },
  { id: "wallstreet", name: "Wall Street", src: "/avatars/wallstreet.jpg?v=1" },
  { id: "firefighter", name: "Firefighter", src: "/avatars/firefighter.jpg?v=1" },
  { id: "bear", name: "Bear Suit", src: "/avatars/bear.jpg?v=1" },
  { id: "birthday", name: "Happy Birthday", src: "/avatars/birthday.jpg?v=1" },
  { id: "foam", name: "Foam Finger", src: "/avatars/foam.jpg?v=1" },
  { id: "referee", name: "Referee", src: "/avatars/referee.jpg?v=1" },
  { id: "turf", name: "Turf", src: "/avatars/turf.jpg?v=1" },
  { id: "cone", name: "Cone", src: "/avatars/cone.jpg?v=1" },
  { id: "gatorade", name: "Gatorade", src: "/avatars/gatorade.jpg?v=2" },
  { id: "mascot", name: "Mascot", src: "/avatars/mascot.jpg?v=1" },
  { id: "otcoin", name: "OT Coin", src: "/avatars/otcoin.jpg?v=4" },
  { id: "robot", name: "Robot", src: "/avatars/robot.jpg?v=1" },
  { id: "dj", name: "DJ", src: "/avatars/dj.jpg?v=1" },
  { id: "flame", name: "On Fire", src: "/avatars/flame.jpg?v=1" },
  { id: "starmage", name: "Star Mage", src: "/avatars/starmage.jpg?v=2" },
  { id: "trex", name: "T-Rex", src: "/avatars/trex.jpg?v=1" },
  { id: "terminator", name: "Terminator", src: "/avatars/terminator.jpg?v=1" },
  { id: "king", name: "King", src: "/avatars/king.jpg?v=1" },
  { id: "bitcoin", name: "Bitcoin", src: "/avatars/bitcoin.jpg?v=1" },
  { id: "diamond", name: "Diamond", src: "/avatars/diamond.jpg?v=1" },
  { id: "club200", name: "200 Club", src: "/avatars/club200.jpg?v=1" },
  { id: "peeping", name: "Peeping Pepe", src: "/avatars/peeping.jpg?v=5" },
  { id: "banana", name: "Trash Can", src: "/avatars/banana.jpg?v=2" },
  { id: "crossword", name: "Crossword", src: "/avatars/crossword.jpg?v=1" },
  { id: "thanos", name: "Thanos", src: "/avatars/thanos.jpg?v=2" },
  { id: "boxaddict", name: "Box Addict", src: "/avatars/boxaddict.jpg?v=1" },
  { id: "lockedin", name: "Locked In", src: "/avatars/lockedin.jpg?v=2" },
  { id: "sniper", name: "Sniper", src: "/avatars/sniper.jpg?v=1" },
  { id: "silvermedal", name: "Silver Medal", src: "/avatars/silvermedal.jpg?v=2" },
  { id: "8ball", name: "8-Ball", src: "/avatars/8ball.jpg?v=2" },
  { id: "ghostpepe", name: "Ghost Pepe", src: "/avatars/ghostpepe.jpg?v=2" },
  { id: "tornado", name: "Tornado", src: "/avatars/tornado.jpg?v=2" },
  { id: "chilipepper", name: "Chili Pepper", src: "/avatars/chilipepper.jpg?v=4" },
  { id: "mafia", name: "Mafia", src: "/avatars/mafia.jpg?v=2" },
  { id: "jacked", name: "Jacked", src: "/avatars/jacked.jpg?v=1" },
  { id: "inflated", name: "Inflated", src: "/avatars/inflated.jpg?v=1" },
  { id: "electrocuted", name: "Electrocuted", src: "/avatars/electrocuted.jpg?v=1" },
  { id: "spider", name: "Spider", src: "/avatars/spider.jpg?v=1" },
  { id: "butler", name: "Butler", src: "/avatars/butler.jpg?v=1" },
  { id: "commish", name: "Commish", src: "/avatars/commish.jpg?v=1" },
  { id: "jail", name: "Jail", src: "/avatars/jail.jpg?v=1" },
  { id: "crypepe", name: "Crying", src: "/avatars/crypepe.jpg?v=2" },
  { id: "joker", name: "Joker", src: "/avatars/joker.jpg?v=2" },
  { id: "doubletrouble", name: "Double Trouble", src: "/avatars/doubletrouble.jpg?v=4" },
  { id: "bullseye", name: "Bullseye", src: "/avatars/bullseye.jpg?v=1" },
  { id: "rainyday", name: "Rainy Day", src: "/avatars/rainyday.jpg?v=1" },
  { id: "earlybird", name: "Early Bird", src: "/avatars/earlybird.jpg?v=1" },
  { id: "heavyhitter", name: "Heavy Hitter", src: "/avatars/heavyhitter.jpg?v=1" },
  { id: "lost", name: "Lost", src: "/avatars/lost.jpg?v=1" },
  { id: "vegas", name: "Vegas", src: "/avatars/vegas.jpg?v=1" },
  { id: "nightowl", name: "Night Owl", src: "/avatars/nightowl.jpg?v=1" },
  { id: "comebackkid", name: "Comeback Kid", src: "/avatars/comebackkid.jpg?v=1" },
  { id: "freefall", name: "Free Fall", src: "/avatars/freefall.jpg?v=1" },
  { id: "boxlunch", name: "Box Lunch", src: "/avatars/boxlunch.jpg?v=1" },
  { id: "golden", name: "Golden", src: "/avatars/golden.jpg?v=1" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];
export type ShirtColor = "white" | "red" | "blue";

const IDS = new Set<string>(AVATARS.map((a) => a.id));

export type Avatar = (typeof AVATARS)[number];
export type ShirtAvatar = Extract<Avatar, { shirt: ShirtColor }>;

export const SHIRT_AVATARS = AVATARS.filter((avatar): avatar is ShirtAvatar => "shirt" in avatar);
export const STAR_UNLOCKS = [
  { id: "foam", stars: 1 },
  { id: "dj", stars: 3 },
  { id: "flame", stars: 5 },
  { id: "8ball", stars: 8 },
  { id: "starmage", stars: 10 },
  { id: "trex", stars: 15 },
  { id: "terminator", stars: 20 },
  { id: "king", stars: 25 },
  { id: "bitcoin", stars: 50 },
  { id: "ghostpepe", stars: 75 },
  { id: "diamond", stars: 100 },
] as const satisfies readonly { id: AvatarId; stars: number }[];
export const CLUB_200 = 200;
export const CLUB_200_CAP = 280;
export const CLUB_200_ID = "club200" as const satisfies AvatarId;
export const PEEPING_ID = "peeping" as const satisfies AvatarId;
export const BANANA_ID = "banana" as const satisfies AvatarId;
export const CROSSWORD_ID = "crossword" as const satisfies AvatarId;
export const THANOS_ID = "thanos" as const satisfies AvatarId;
export const BOX_ADDICT_ID = "boxaddict" as const satisfies AvatarId;
export const COMMISH_ID = "commish" as const satisfies AvatarId;
export const JAIL_ID = "jail" as const satisfies AvatarId;
export const LOCKED_IN_ID = "lockedin" as const satisfies AvatarId;
export const SNIPER_ID = "sniper" as const satisfies AvatarId;
export const SILVER_MEDAL_ID = "silvermedal" as const satisfies AvatarId;
export const CRYPEPE_ID = "crypepe" as const satisfies AvatarId;
export const JOKER_ID = "joker" as const satisfies AvatarId;
export const DOUBLE_TROUBLE_ID = "doubletrouble" as const satisfies AvatarId;
export const BULLSEYE_ID = "bullseye" as const satisfies AvatarId;
export const RAINY_DAY_ID = "rainyday" as const satisfies AvatarId;
export const EARLY_BIRD_ID = "earlybird" as const satisfies AvatarId;
export const HEAVY_HITTER_ID = "heavyhitter" as const satisfies AvatarId;
export const LOST_ID = "lost" as const satisfies AvatarId;
export const VEGAS_ID = "vegas" as const satisfies AvatarId;
export const NIGHT_OWL_ID = "nightowl" as const satisfies AvatarId;
export const COMEBACK_KID_ID = "comebackkid" as const satisfies AvatarId;
export const FREE_FALL_ID = "freefall" as const satisfies AvatarId;
export const BOX_LUNCH_ID = "boxlunch" as const satisfies AvatarId;
export const BANANA_SCORE_UNDER = 60;
export const CROSSWORD_STREAK_NEED = 10;
export const LOCKED_IN_STREAK_NEED = 100;
export const THANOS_OWN_NEED = 50;
export const BOX_ADDICT_POOL_NEED = 25;
export const SILVER_SECOND_NEED = 5;
export const SNIPER_MARGIN = 1;
export const FEAT_TRACK_FROM = "2026-09-17";
export const EARLY_BIRD_NEED = 10;
export const NIGHT_OWL_NEED = 10;
export const LOST_GAP_DAYS = 10;
export const HEAVY_HITTER_PPR = 50;
const STAR_IDS = new Set<string>(STAR_UNLOCKS.map((row) => row.id));
const FEAT_IDS = new Set<string>([
  CLUB_200_ID,
  PEEPING_ID,
  BANANA_ID,
  CROSSWORD_ID,
  THANOS_ID,
  BOX_ADDICT_ID,
  LOCKED_IN_ID,
  SNIPER_ID,
  SILVER_MEDAL_ID,
  COMMISH_ID,
  JAIL_ID,
  CRYPEPE_ID,
  JOKER_ID,
  DOUBLE_TROUBLE_ID,
  BULLSEYE_ID,
  RAINY_DAY_ID,
  EARLY_BIRD_ID,
  HEAVY_HITTER_ID,
  LOST_ID,
  VEGAS_ID,
  NIGHT_OWL_ID,
  COMEBACK_KID_ID,
  FREE_FALL_ID,
  BOX_LUNCH_ID,
]);
export const ACHIEVEMENT_UNLOCKS = [
  { id: CLUB_200_ID, how: "Score 200+ points in a single match." },
  { id: PEEPING_ID, how: "View a live match." },
  { id: BANANA_ID, how: "Score under 60 in a Daily Match." },
  { id: CROSSWORD_ID, how: "Play 10 Daily Elims in a row." },
  { id: THANOS_ID, how: "Own 50 unique avatars." },
  { id: BOX_ADDICT_ID, how: "Open 25 mystery boxes." },
  { id: LOCKED_IN_ID, how: "100 consecutive calendar days with a Daily Match submitted." },
  { id: SNIPER_ID, how: "Finish a Weekly Match 1st by less than 1.0 over 2nd." },
  { id: SILVER_MEDAL_ID, how: "Finish 2nd on 5 separate Daily boards." },
  { id: DOUBLE_TROUBLE_ID, how: "Win Daily and Weekly on the same day." },
  { id: BULLSEYE_ID, how: "Score exactly 100.0 in a Daily or Weekly Match." },
  { id: RAINY_DAY_ID, how: "Finish last in Daily two days in a row." },
  { id: EARLY_BIRD_ID, how: "Be the first to submit a Daily Match 10 times." },
  { id: HEAVY_HITTER_ID, how: "Draft a player who scores 50+ in a Weekly Match." },
  { id: LOST_ID, how: "Go 10+ days between Daily submissions." },
  { id: VEGAS_ID, how: "Open your first scratch ticket." },
  { id: NIGHT_OWL_ID, how: "Be the last to submit a Daily Match 10 times." },
  { id: COMEBACK_KID_ID, how: "Finish last in Daily, then first the next day." },
  { id: FREE_FALL_ID, how: "Finish first in Daily, then last the next day." },
  { id: BOX_LUNCH_ID, how: "Open a Mystery Box and a scratch ticket the same day." },
] as const satisfies readonly { id: AvatarId; how: string }[];
export const PRIZE_AVATARS = AVATARS.filter(
  (avatar) => avatar.id !== "poor" && avatar.id !== "golden" && !STAR_IDS.has(avatar.id) && !FEAT_IDS.has(avatar.id),
);
/** Mystery Box only — never a scratch-ticket prize. Still in PRIZE_AVATARS / pickPrize. */
export const BOX_ONLY_IDS = ["jacked", "inflated", "electrocuted", "spider", "butler"] as const satisfies readonly AvatarId[];
const PRIZE_IDS = new Set<string>(PRIZE_AVATARS.map((avatar) => avatar.id));

/** Distinct owned ids that are in the mystery-box pool. */
export function boxPoolOwnedCount(owned: readonly string[]): number {
  let n = 0;
  const seen = new Set<string>();
  for (const id of owned) {
    if (!PRIZE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

export function hitBoxAddict(owned: readonly string[]): boolean {
  return boxPoolOwnedCount(owned) >= BOX_ADDICT_POOL_NEED;
}

/** Daily Match score (not weekly, not private). Under 60 unlocks Trash Can. */
export function hitBananaScore(score: number): boolean {
  return Number.isFinite(score) && score < BANANA_SCORE_UNDER;
}

export function hitBullseyeScore(score: number): boolean {
  return Number.isFinite(score) && Math.round(score * 10) / 10 === 100;
}

export function hitHeavyHitterScore(score: number): boolean {
  return Number.isFinite(score) && score >= HEAVY_HITTER_PPR;
}

export function skipHeavyHitterWeek(season: number, week: number): boolean {
  return season === 2026 && week === 1;
}

export function stampDayGap(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) return 0;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function lostGapHit(prev: string, cur: string, from = FEAT_TRACK_FROM): boolean {
  return prev >= from && stampDayGap(prev, cur) >= LOST_GAP_DAYS;
}

export function freeFallHit(prevFirst: readonly string[], todayLast: readonly string[], userId: string): boolean {
  return prevFirst.includes(userId) && todayLast.includes(userId);
}
  return prevFirst.includes(userId) && todayLast.includes(userId);
}

export function comebackKidHit(prevLast: readonly string[], todayFirst: readonly string[], userId: string): boolean {
  return prevLast.includes(userId) && todayFirst.includes(userId);
}

export type EarlyBirdRow = { day: string; userId: string; at: number };

/** Distinct days this user was first visible lock that day. Sep 16 and earlier skipped. */
export function earlyBirdDayCount(userId: string, rows: readonly EarlyBirdRow[], from = FEAT_TRACK_FROM): number {
  const byDay = new Map<string, { userId: string; at: number }[]>();
  for (const row of rows) {
    if (!row.day || row.day < from || !row.userId || !Number.isFinite(row.at)) continue;
    const list = byDay.get(row.day) ?? [];
    list.push({ userId: row.userId, at: row.at });
    byDay.set(row.day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    const min = Math.min(...list.map((row) => row.at));
    if (list.some((row) => row.at === min && row.userId === userId)) n += 1;
  }
  return n;
}

/** Distinct days this user still holds last visible lock that day. Sep 16 and earlier skipped. Last can move until midnight ET. */
export function nightOwlDayCount(userId: string, rows: readonly EarlyBirdRow[], from = FEAT_TRACK_FROM): number {
  const byDay = new Map<string, { userId: string; at: number }[]>();
  for (const row of rows) {
    if (!row.day || row.day < from || !row.userId || !Number.isFinite(row.at)) continue;
    const list = byDay.get(row.day) ?? [];
    list.push({ userId: row.userId, at: row.at });
    byDay.set(row.day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    const max = Math.max(...list.map((row) => row.at));
    if (list.some((row) => row.at === max && row.userId === userId)) n += 1;
  }
  return n;
}

export function justUnlockedBanana(before: readonly string[], after: readonly string[]): boolean {
  return !before.includes(BANANA_ID) && after.includes(BANANA_ID);
}

/** First scratch unlock of Sad Crying Pepe or Joker. Already owned is not a first unlock. */
export function justUnlockedScratchLook(
  before: readonly string[],
  after: readonly string[],
): typeof CRYPEPE_ID | typeof JOKER_ID | null {
  if (!before.includes(JOKER_ID) && after.includes(JOKER_ID)) return JOKER_ID;
  if (!before.includes(CRYPEPE_ID) && after.includes(CRYPEPE_ID)) return CRYPEPE_ID;
  return null;
}
export const CLOSET_AVATARS = AVATARS.filter((avatar) => avatar.id === "holy" || !("shirt" in avatar));

export function isAvatarId(id: string): id is AvatarId {
  return IDS.has(id);
}

export function avatarById(id: string): (typeof AVATARS)[number] {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function isShirtAvatar(id: string): boolean {
  return SHIRT_AVATARS.some((avatar) => avatar.id === id);
}

export function parseOwned(raw: unknown): AvatarId[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const ids = list.filter((id): id is AvatarId => typeof id === "string" && isAvatarId(id));
  if (!ids.includes("poor")) ids.unshift("poor");
  return [...new Set(ids)];
}

export function ownsAvatar(id: string, owned: readonly string[]): boolean {
  if (id === "poor") return true;
  return isAvatarId(id) && owned.includes(id);
}

export function isUnlocked(id: string, owned: readonly string[]): boolean {
  if (id === "holy") return SHIRT_AVATARS.some((avatar) => owned.includes(avatar.id));
  return ownsAvatar(id, owned);
}

export function isStarAvatar(id: string): boolean {
  return STAR_IDS.has(id);
}

export function starNeed(id: string): number {
  return STAR_UNLOCKS.find((row) => row.id === id)?.stars ?? 0;
}

export function starLooksFor(stars: number): AvatarId[] {
  return STAR_UNLOCKS.filter((row) => stars >= row.stars).map((row) => row.id);
}

export function isFeatAvatar(id: string): boolean {
  return FEAT_IDS.has(id);
}

/** Longest run of consecutive YYYY-MM-DD calendar days. */
export function longestDayStreak(days: readonly string[]): number {
  const uniq = [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
  if (uniq.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    const prev = Date.parse(`${uniq[i - 1]}T00:00:00Z`);
    const next = Date.parse(`${uniq[i]}T00:00:00Z`);
    cur = next - prev === 86_400_000 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/** Unique 1st, margin over 2nd is (0, 1). Ties for 1st do not count. */
export function sniperWeekHit(rows: readonly { userId: string; score: number }[], userId: string): boolean {
  if (rows.length < 2) return false;
  let first = -Infinity;
  for (const row of rows) if (row.score > first) first = row.score;
  const leaders = rows.filter((row) => row.score === first);
  if (leaders.length !== 1 || leaders[0]?.userId !== userId) return false;
  let second = -Infinity;
  for (const row of rows) {
    if (row.score < first && row.score > second) second = row.score;
  }
  if (!Number.isFinite(second) || second === -Infinity) return false;
  const margin = first - second;
  return margin > 0 && margin < SNIPER_MARGIN;
}

/** Distinct days the user placed 2nd (second-highest score that day). */
export function silverSecondDayCount(rows: readonly { day: string; userId: string; score: number }[], userId: string): number {
  const byDay = new Map<string, { userId: string; score: number }[]>();
  for (const row of rows) {
    const day = row.day.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    let first = -Infinity;
    for (const row of list) if (row.score > first) first = row.score;
    let second = -Infinity;
    for (const row of list) {
      if (row.score < first && row.score > second) second = row.score;
    }
    if (!Number.isFinite(second) || second === -Infinity) continue;
    if (list.some((row) => row.userId === userId && row.score === second)) n += 1;
  }
  return n;
}

export function remainingToUnlock(owned: readonly string[]): number {
  return CLOSET_AVATARS.filter(
    (avatar) =>
      avatar.id !== "poor" && !isStarAvatar(avatar.id) && !isFeatAvatar(avatar.id) && !isUnlocked(avatar.id, owned),
  ).length;
}

export function clampAvatar(id: string, owned?: readonly string[]): AvatarId {
  if (!isAvatarId(id)) return "poor";
  if (owned && !ownsAvatar(id, owned)) return "poor";
  return id;
}

export function pickPrize(owned: readonly string[], salt = ""): AvatarId | null {
  const open = PRIZE_AVATARS.filter((avatar) => !owned.includes(avatar.id));
  if (open.length === 0) return null;
  return open[randomIndex(open.length, salt)]!.id;
}

/** Unbiased index. Prefer CSPRNG so cloned serverless isolates cannot share a Math.random sequence. */
function randomIndex(length: number, salt = ""): number {
  if (length <= 1) return 0;
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    return Math.floor(Math.random() * length);
  }
  const mix = (bytes: Uint8Array) => {
    cryptoObj.getRandomValues(bytes);
    if (!salt) return;
    const extra = new TextEncoder().encode(salt);
    for (let i = 0; i < extra.length; i += 1) {
      bytes[i % bytes.length] ^= extra[i]!;
    }
  };
  const bytes = new Uint8Array(4);
  const limit = Math.floor(0x100000000 / length) * length;
  for (let n = 0; n < 12; n += 1) {
    mix(bytes);
    const x = new DataView(bytes.buffer).getUint32(0, false);
    if (x < limit) return x % length;
  }
  mix(bytes);
  return new DataView(bytes.buffer).getUint32(0, false) % length;
}

export function walletBalance(wins: number, owned: readonly string[], credit = 0): number {
  const boxPrizes = owned.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
  const gold = owned.includes("golden") ? GOLDEN_COST : 0;
  return Math.max(0, wins * WIN_PAY - boxPrizes * BOX_COST - gold + Math.floor(credit));
}
