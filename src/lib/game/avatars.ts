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
  { id: "focused", name: "Focused", src: "/avatars/focused.jpg?v=1" },
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
  { id: "lion", name: "Lion", src: "/avatars/lion.jpg?v=1" },
  { id: "balloon", name: "Balloon", src: "/avatars/balloon.jpg?v=1" },
  { id: "aquarium", name: "Aquarium", src: "/avatars/aquarium.jpg?v=1" },
  { id: "pizza", name: "Pizza", src: "/avatars/pizza.jpg?v=1" },
  { id: "commish", name: "Commish", src: "/avatars/commish.jpg?v=1" },
  { id: "jail", name: "Jail", src: "/avatars/jail.jpg?v=1" },
  { id: "crypepe", name: "Crying", src: "/avatars/crypepe.jpg?v=2" },
  { id: "joker", name: "Joker", src: "/avatars/joker.jpg?v=2" },
  { id: "doubletrouble", name: "Double Trouble", src: "/avatars/doubletrouble.jpg?v=4" },
  { id: "bullseye", name: "Bullseye", src: "/avatars/bullseye.jpg?v=1" },
  { id: "rainyday", name: "Rainy Day", src: "/avatars/rainyday.jpg?v=1" },
  { id: "poop", name: "Poop", src: "/avatars/poop.jpg?v=1" },
  { id: "earlybird", name: "Early Bird", src: "/avatars/earlybird.jpg?v=1" },
  { id: "heavyhitter", name: "Heavy Hitter", src: "/avatars/heavyhitter.jpg?v=1" },
  { id: "lost", name: "Lost", src: "/avatars/lost.jpg?v=1" },
  { id: "vegas", name: "Vegas", src: "/avatars/vegas.jpg?v=1" },
  { id: "nightowl", name: "Night Owl", src: "/avatars/nightowl.jpg?v=1" },
  { id: "comebackkid", name: "Comeback Kid", src: "/avatars/comebackkid.jpg?v=1" },
  { id: "freefall", name: "Free Fall", src: "/avatars/freefall.jpg?v=1" },
  { id: "boxlunch", name: "Box Lunch", src: "/avatars/boxlunch.jpg?v=1" },
  { id: "doubledonut", name: "Double Donut", src: "/avatars/doubledonut.jpg?v=1" },
  { id: "lumpedup", name: "Lumped Up", src: "/avatars/lumpedup.jpg?v=1" },
  { id: "negative", name: "Negative", src: "/avatars/negative.jpg?v=1" },
  { id: "flash", name: "Flash", src: "/avatars/flash.jpg?v=1" },
  { id: "thrifty", name: "Thrifty", src: "/avatars/thrifty.jpg?v=1" },
  { id: "ironboot", name: "Iron Boot", src: "/avatars/ironboot.jpg?v=1" },
  { id: "overhead", name: "Overhead", src: "/avatars/overhead.jpg?v=1" },
  { id: "mirror", name: "Mirror", src: "/avatars/mirror.jpg?v=1" },
  { id: "twin", name: "Twin", src: "/avatars/twin.jpg?v=1" },
  { id: "threeleafclover", name: "3 Leaf Clover", src: "/avatars/threeleafclover.jpg?v=1" },
  { id: "tinyhunter", name: "Tiny Hunter", src: "/avatars/tinyhunter.jpg?v=1" },
  { id: "hunter", name: "Hunter", src: "/avatars/hunter.jpg?v=1" },
  { id: "bighunter", name: "Big Hunter", src: "/avatars/bighunter.jpg?v=1" },
  { id: "advancedhunter", name: "Advanced Hunter", src: "/avatars/advancedhunter.jpg?v=1" },
  { id: "megahunter", name: "Mega Hunter", src: "/avatars/megahunter.jpg?v=1" },
  { id: "alienhunter", name: "Alien Hunter", src: "/avatars/alienhunter.jpg?v=1" },
  { id: "gianthunter", name: "Giant Hunter", src: "/avatars/gianthunter.jpg?v=1" },
  { id: "titanhunter", name: "Titan Hunter", src: "/avatars/titanhunter.jpg?v=1" },
  { id: "ultrahunter", name: "Ultra Hunter", src: "/avatars/ultrahunter.jpg?v=1" },
  { id: "threeheaded", name: "3 Headed", src: "/avatars/threeheaded.jpg?v=1" },
  { id: "tripledonut", name: "Triple Donut", src: "/avatars/tripledonut.jpg?v=1" },
  { id: "penny", name: "Penny", src: "/avatars/penny.jpg?v=1" },
  { id: "bluestreak", name: "Blue Streak", src: "/avatars/bluestreak.jpg?v=1" },
  { id: "coldstreak", name: "Cold Streak", src: "/avatars/coldstreak.jpg?v=1" },
  { id: "football", name: "Football", src: "/avatars/football.jpg?v=1" },
  { id: "luchador", name: "Luchador", src: "/avatars/luchador.jpg?v=1" },
  { id: "tailgater", name: "Tailgater", src: "/avatars/tailgater.jpg?v=1" },
  { id: "broadcast", name: "Broadcast", src: "/avatars/broadcast.jpg?v=1" },
  { id: "rubberduck", name: "Rubber Duck", src: "/avatars/rubberduck.jpg?v=1" },
  { id: "golden", name: "Golden", src: "/avatars/golden.jpg?v=1" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

export type ShirtColor = "white" | "red" | "blue";

export const IDS = new Set<string>(AVATARS.map((a) => a.id));

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

export const FOCUSED_ID = "focused" as const satisfies AvatarId;

export const SNIPER_ID = "sniper" as const satisfies AvatarId;

export const SILVER_MEDAL_ID = "silvermedal" as const satisfies AvatarId;

export const CRYPEPE_ID = "crypepe" as const satisfies AvatarId;

export const JOKER_ID = "joker" as const satisfies AvatarId;

export const DOUBLE_TROUBLE_ID = "doubletrouble" as const satisfies AvatarId;

export const BULLSEYE_ID = "bullseye" as const satisfies AvatarId;

export const RAINY_DAY_ID = "rainyday" as const satisfies AvatarId;

export const POOP_ID = "poop" as const satisfies AvatarId;

export const EARLY_BIRD_ID = "earlybird" as const satisfies AvatarId;

export const HEAVY_HITTER_ID = "heavyhitter" as const satisfies AvatarId;

export const LOST_ID = "lost" as const satisfies AvatarId;

export const VEGAS_ID = "vegas" as const satisfies AvatarId;

export const NIGHT_OWL_ID = "nightowl" as const satisfies AvatarId;

export const COMEBACK_KID_ID = "comebackkid" as const satisfies AvatarId;

export const FREE_FALL_ID = "freefall" as const satisfies AvatarId;

export const BOX_LUNCH_ID = "boxlunch" as const satisfies AvatarId;

export const DOUBLE_DONUT_ID = "doubledonut" as const satisfies AvatarId;

export const LUMPED_UP_ID = "lumpedup" as const satisfies AvatarId;

export const NEGATIVE_ID = "negative" as const satisfies AvatarId;

export const FLASH_ID = "flash" as const satisfies AvatarId;

export const THRIFTY_ID = "thrifty" as const satisfies AvatarId;

export const IRON_BOOT_ID = "ironboot" as const satisfies AvatarId;

export const OVERHEAD_ID = "overhead" as const satisfies AvatarId;

export const MIRROR_ID = "mirror" as const satisfies AvatarId;

export const TWIN_ID = "twin" as const satisfies AvatarId;

export const THREE_LEAF_ID = "threeleafclover" as const satisfies AvatarId;

export const THREE_LEAF_NEED = 3;

export const TINY_HUNTER_ID = "tinyhunter" as const satisfies AvatarId;

export const HUNTER_ID = "hunter" as const satisfies AvatarId;

export const BIG_HUNTER_ID = "bighunter" as const satisfies AvatarId;

export const ADVANCED_HUNTER_ID = "advancedhunter" as const satisfies AvatarId;

export const MEGA_HUNTER_ID = "megahunter" as const satisfies AvatarId;

export const ALIEN_HUNTER_ID = "alienhunter" as const satisfies AvatarId;

export const GIANT_HUNTER_ID = "gianthunter" as const satisfies AvatarId;

export const TITAN_HUNTER_ID = "titanhunter" as const satisfies AvatarId;

export const ULTRA_HUNTER_ID = "ultrahunter" as const satisfies AvatarId;

export const THREE_HEADED_ID = "threeheaded" as const satisfies AvatarId;

export const TRIPLE_DONUT_ID = "tripledonut" as const satisfies AvatarId;

export const PENNY_ID = "penny" as const satisfies AvatarId;

export const BLUE_STREAK_ID = "bluestreak" as const satisfies AvatarId;

export const COLD_STREAK_ID = "coldstreak" as const satisfies AvatarId;

export const BANANA_SCORE_UNDER = 60;

export const CROSSWORD_STREAK_NEED = 10;

export const LOCKED_IN_STREAK_NEED = 100;

export const FOCUSED_STREAK_NEED = 50;

export const THANOS_OWN_NEED = 50;

export const BOX_ADDICT_POOL_NEED = 25;

export const SILVER_SECOND_NEED = 5;

export const SNIPER_MARGIN = 1;

export const FEAT_TRACK_FROM = "2026-09-17";

export const EARLY_BIRD_NEED = 10;

export const POOP_NEED = 10;

export const NIGHT_OWL_NEED = 10;

export const LOST_GAP_DAYS = 10;

export const HEAVY_HITTER_PPR = 50;

export const LUMPED_UP_UNDER = 100;

export const LUMPED_UP_DAYS = 3;

export const DOUBLE_DONUT_NEED = 2;

export const DOUBLE_DONUT_FROM = "2026-09-23";

export const NEGATIVE_FROM = "2026-09-23";

export const FEAT_SCRATCH_POINTS = 50;

export const THRIFTY_CAP = 30;

export const IRON_BOOT_POINTS = 40;

export const FLASH_FROM_SEASON = 2026;

export const FLASH_FROM_WEEK = 3;

export const OVERHEAD_FROM = "2026-09-25";

export const MIRROR_FROM = "2026-09-25";

export const OVERHEAD_SCORE = 150;

export const TWIN_FROM = "2026-09-26";

export const THREE_HEADED_FROM = "2026-09-26";

export const TRIPLE_DONUT_FROM = "2026-09-26";

export const PENNY_FROM = "2026-09-26";

export const BLUE_STREAK_FROM = "2026-09-26";

export const COLD_STREAK_FROM = "2026-09-20";

export const THREE_HEADED_NEED = 3;

export const TRIPLE_DONUT_NEED = 3;

export const BLUE_STREAK_NEED = 4;

export const COLD_STREAK_NEED = 15;

export const STAR_IDS = new Set<string>(STAR_UNLOCKS.map((row) => row.id));

export const FEAT_IDS = new Set<string>([
  CLUB_200_ID,
  PEEPING_ID,
  BANANA_ID,
  CROSSWORD_ID,
  THANOS_ID,
  BOX_ADDICT_ID,
  LOCKED_IN_ID,
  FOCUSED_ID,
  SNIPER_ID,
  SILVER_MEDAL_ID,
  COMMISH_ID,
  JAIL_ID,
  CRYPEPE_ID,
  JOKER_ID,
  DOUBLE_TROUBLE_ID,
  BULLSEYE_ID,
  RAINY_DAY_ID,
  POOP_ID,
  EARLY_BIRD_ID,
  HEAVY_HITTER_ID,
  LOST_ID,
  VEGAS_ID,
  NIGHT_OWL_ID,
  COMEBACK_KID_ID,
  FREE_FALL_ID,
  BOX_LUNCH_ID,
  DOUBLE_DONUT_ID,
  LUMPED_UP_ID,
  NEGATIVE_ID,
  FLASH_ID,
  THRIFTY_ID,
  IRON_BOOT_ID,
  OVERHEAD_ID,
  MIRROR_ID,
  TWIN_ID,
  THREE_LEAF_ID,
  TINY_HUNTER_ID,
  HUNTER_ID,
  BIG_HUNTER_ID,
  ADVANCED_HUNTER_ID,
  MEGA_HUNTER_ID,
  ALIEN_HUNTER_ID,
  GIANT_HUNTER_ID,
  TITAN_HUNTER_ID,
  ULTRA_HUNTER_ID,
  THREE_HEADED_ID,
  TRIPLE_DONUT_ID,
  PENNY_ID,
  BLUE_STREAK_ID,
  COLD_STREAK_ID,
]);

export const ACHIEVEMENT_UNLOCKS = [
  { id: CLUB_200_ID, how: "Score 200+ points in a single match." },
  { id: PEEPING_ID, how: "View a live match." },
  { id: BANANA_ID, how: "Score under 60 in a Daily Match." },
  { id: CROSSWORD_ID, how: "Play 10 Daily Elims in a row." },
  { id: THANOS_ID, how: "Own 50 unique avatars." },
  { id: BOX_ADDICT_ID, how: "Open 25 mystery boxes." },
  { id: LOCKED_IN_ID, how: "100 consecutive calendar days with a Daily Match submitted." },
  { id: FOCUSED_ID, how: "50 consecutive calendar days with a Daily Match submitted." },
  { id: SNIPER_ID, how: "Win a Weekly Match by less than 1 point over 2nd Place." },
  { id: SILVER_MEDAL_ID, how: "Finish 2nd on 5 separate Daily boards." },
  { id: DOUBLE_TROUBLE_ID, how: "Win Daily and Weekly on the same day." },
  { id: BULLSEYE_ID, how: "Score exactly 100.0 in a Daily or Weekly Match." },
  { id: RAINY_DAY_ID, how: "Finish last in Daily two days in a row." },
  { id: POOP_ID, how: "Finish last in Daily 10 times." },
  { id: EARLY_BIRD_ID, how: "Be the first to submit a Daily Match 10 times." },
  { id: HEAVY_HITTER_ID, how: "Draft a player who scores 50+ in a Weekly Match." },
  { id: LOST_ID, how: "Go 10+ days between Daily submissions." },
  { id: VEGAS_ID, how: "Open your first scratch ticket." },
  { id: NIGHT_OWL_ID, how: "Be the last to submit a Daily Match 10 times." },
  { id: COMEBACK_KID_ID, how: "Finish last in Daily, then first the next day." },
  { id: FREE_FALL_ID, how: "Finish first in Daily, then last the next day." },
  { id: BOX_LUNCH_ID, how: "Open a Mystery Box and a scratch ticket the same day." },
  { id: DOUBLE_DONUT_ID, how: "Start two or more players who score 0 in a Daily or Weekly Match." },
  { id: LUMPED_UP_ID, how: "Score under 100 in Daily three days in a row." },
  { id: NEGATIVE_ID, how: "Start a player who finishes with negative points in a Daily Match." },
  { id: FLASH_ID, how: "First to 100.0 in a live Weekly." },
  { id: THRIFTY_ID, how: "Win a Daily or Weekly spending $30 or less." },
  { id: IRON_BOOT_ID, how: "Defense + Kicker score 40+ combined in one Weekly." },
  { id: OVERHEAD_ID, how: "Score 150+ in Daily, then get passed." },
  { id: MIRROR_ID, how: "Post the same lineup as another player." },
  { id: TWIN_ID, how: "Same score as another player with a different lineup." },
  { id: THREE_LEAF_ID, how: "Scratch three different results." },
  { id: TINY_HUNTER_ID, how: "Own 5 Achievements." },
  { id: HUNTER_ID, how: "Own 10 Achievements." },
  { id: BIG_HUNTER_ID, how: "Own 15 Achievements." },
  { id: ADVANCED_HUNTER_ID, how: "Own 20 Achievements." },
  { id: MEGA_HUNTER_ID, how: "Own 25 Achievements." },
  { id: ALIEN_HUNTER_ID, how: "Own 30 Achievements." },
  { id: GIANT_HUNTER_ID, how: "Own 35 Achievements." },
  { id: TITAN_HUNTER_ID, how: "Own 40 Achievements." },
  { id: ULTRA_HUNTER_ID, how: "Own 45 Achievements." },
  { id: THREE_HEADED_ID, how: "Start 3 players from the same NFL team in a Daily or Weekly Match." },
  { id: TRIPLE_DONUT_ID, how: "Start three or more players who score 0 in a Daily or Weekly Match." },
  { id: PENNY_ID, how: "Spend $10 or less on a Daily lineup." },
  { id: BLUE_STREAK_ID, how: "Start 4 or more players who score in the blue in one Daily." },
  { id: COLD_STREAK_ID, how: "Finish 15 Daily Matches in a row with no Daily win." },
  { id: CRYPEPE_ID, how: "Hit Nothing on a scratch ticket." },
] as const satisfies readonly { id: AvatarId; how: string }[];

export const PRIZE_AVATARS = AVATARS.filter(
  (avatar) => avatar.id !== "poor" && avatar.id !== "golden" && !STAR_IDS.has(avatar.id) && !FEAT_IDS.has(avatar.id),
);

/** Mystery Box only — never a scratch-ticket prize. Still in PRIZE_AVATARS / pickPrize. */
export const BOX_ONLY_IDS = ["jacked", "inflated", "electrocuted", "spider", "butler", "lion", "balloon", "aquarium", "pizza"] as const satisfies readonly AvatarId[];

export const PRIZE_IDS = new Set<string>(PRIZE_AVATARS.map((avatar) => avatar.id));

export const HUNTER_LADDER = [
  { id: TINY_HUNTER_ID, need: 5 },
  { id: HUNTER_ID, need: 10 },
  { id: BIG_HUNTER_ID, need: 15 },
  { id: ADVANCED_HUNTER_ID, need: 20 },
  { id: MEGA_HUNTER_ID, need: 25 },
  { id: ALIEN_HUNTER_ID, need: 30 },
  { id: GIANT_HUNTER_ID, need: 35 },
  { id: TITAN_HUNTER_ID, need: 40 },
  { id: ULTRA_HUNTER_ID, need: 45 },
] as const satisfies readonly { id: AvatarId; need: number }[];

export const ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENT_UNLOCKS.map((row) => row.id));

export const CLOSET_AVATARS = AVATARS.filter((avatar) => avatar.id === "holy" || !("shirt" in avatar)).sort((a, b) => {
  const rank = (id: string) => (STAR_IDS.has(id) ? 1 : ACHIEVEMENT_IDS.has(id) || FEAT_IDS.has(id) ? 2 : 0);
  return rank(a.id) - rank(b.id);
});

/** Scratch-point rungs. +3 from 12 through 100, skipping any star that already unlocks a look. */
export const STAR_SCRATCH_FROM = 12;

export const STAR_SCRATCH_CAP = 100;

export const STAR_SCRATCH_STEP = 3;

export const STAR_SCRATCH_POINTS = 100;
export {
  boxPoolOwnedCount,
  hitBoxAddict,
  huntersToGrant,
  isAvatarId,
  avatarById,
  isShirtAvatar,
  parseOwned,
  ownsAvatar,
  isUnlocked,
  isStarAvatar,
  starNeed,
  lookSource,
  starLooksFor,
  isFeatAvatar,
  remainingToUnlock,
  clampAvatar,
  pickPrize,
  walletBalance,
} from "./avatars/owned";
export {
  hitBananaScore,
  threeLeafHit,
  hitBullseyeScore,
  hitHeavyHitterScore,
  skipHeavyHitterWeek,
  featWeekFromW3,
  hitFlashTotal,
  thriftyHit,
  thriftySlotCosts,
  lineupSignature,
  overheadTenths,
  overheadPassed,
  mirrorUserIds,
  twinUserIds,
  stampDayGap,
  lostGapHit,
  isExactZeroScore,
  isNegativeScore,
  doubleDonutHit,
  tripleDonutHit,
  threeHeadedHit,
  pennyHit,
  blueStreakHit,
  coldStreakHit,
  lumpedUpHit,
  weeklyRealZeroCount,
  freeFallHit,
  comebackKidHit,
  earlyBirdDayCount,
  nightOwlDayCount,
  longestDayStreak,
  sniperWeekHit,
  silverSecondDayCount,
} from "./avatars/hits";
export type { OverheadRow, TwinRow, EarlyBirdRow } from "./avatars/hits";
export {
  justUnlockedBanana,
  justUnlockedScratchLook,
  starScratchRungs,
  starScratchRungsCrossed,
} from "./avatars/stars";
