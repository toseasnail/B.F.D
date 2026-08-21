export const COLORS = ["purple", "yellow", "green", "blue", "white"];

/** Bump when the live desk must be distinguishable from an old Render process. */
export const DESK_VERSION = 15;

export const COLOR_ORDER = [...COLORS];

export const COLOR_HEX = {
  purple: "#9b3db5",
  yellow: "#e2b100",
  green: "#2f9e44",
  blue: "#1c7ed6",
  white: "#f1f3f5",
};

/** 13 rows (bottom=0) × 7 columns (left=0). Official 2023 board. */
export const PRICE_TABLE = [
  [4, 5, 6, 8, 10, 12, 15],
  [6, 8, 10, 12, 15, 20, 25],
  [10, 12, 15, 20, 25, 30, 35],
  [15, 20, 25, 30, 35, 40, 45],
  [25, 30, 35, 40, 45, 50, 60],
  [35, 40, 45, 50, 60, 65, 75],
  [45, 50, 60, 65, 75, 85, 90],
  [60, 70, 75, 85, 90, 100, 110],
  [75, 85, 95, 100, 110, 120, 130],
  [95, 105, 115, 125, 135, 145, 155],
  [115, 125, 135, 145, 160, 170, 180],
  [135, 150, 160, 170, 180, 200, 210],
  [150, 175, 190, 200, 210, 225, 240],
];

export const MAX_ROW = PRICE_TABLE.length - 1;
export const MAX_COL = PRICE_TABLE[0].length - 1;

export const START_PRICE_POS = { row: 0, col: 3 }; // $8
export const CHEAP_SETUP_POS = { row: 0, col: 2 }; // $6
export const EXPENSIVE_SETUP_POS = { row: 0, col: 4 }; // $10

/** Gold price spaces, bottom to top. */
export const GOLD_TRACK = [
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 40, 45, 50, 55, 60, 65, 70,
  75, 80, 85, 90, 95, 100,
];

/**
 * Level tiles 0–9 (five double-sided tiles).
 * shareLimit / goldLimit / drawCount taken from the 2023 tiles and rulebook examples.
 */
export const LEVELS = [
  { shareLimit: 1, goldLimit: 1, drawCount: 5 },
  { shareLimit: 1, goldLimit: 1, drawCount: 6 },
  { shareLimit: 2, goldLimit: 1, drawCount: 6 },
  { shareLimit: 2, goldLimit: 2, drawCount: 7 },
  { shareLimit: 3, goldLimit: 2, drawCount: 7 },
  { shareLimit: 3, goldLimit: 3, drawCount: 8 },
  { shareLimit: 4, goldLimit: 4, drawCount: 9 },
  { shareLimit: 4, goldLimit: 4, drawCount: 10 },
  { shareLimit: 5, goldLimit: 5, drawCount: 11 },
  { shareLimit: 5, goldLimit: 5, drawCount: 12 },
];

export const SHARES_PER_COLOR = 25;
export const BLACK_SHARES = 15;

export const SMALL_GOLD_VALUE = 100;
export const BIG_GOLD_VALUE = 500;
export const SMALL_PER_BIG = 5;

export const BONUS_POWERS = {
  2: ["manipulate"],
  3: ["manipulate", "extraSell"],
  4: ["manipulate", "extraSell", "extraGold"],
  5: ["manipulate", "extraSell", "extraGold", "extraBuy"],
};

export function emptyColorCounts() {
  return { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 };
}

export function cloneCounts(counts) {
  return { ...counts };
}

export function totalCounts(counts) {
  return COLORS.reduce((sum, color) => sum + (counts[color] || 0), 0);
}

export function priceAt(pos) {
  const row = Math.max(0, Math.min(MAX_ROW, pos.row));
  const col = Math.max(0, Math.min(MAX_COL, pos.col));
  return PRICE_TABLE[row][col];
}

/**
 * Cream (C) / dark-green (G) paper on the 2023 share-price table
 * (bottom row = 0). Sampled from the official board art; the $8 start
 * disc on 1f is a marker, not a green area.
 *
 * Each 4-connected same-color patch is one level. Level 0 is the whole
 * opening cream (1f plus the leftover around the first green chevron).
 * That yields exactly the ten areas 0–9, puts $110 in level 6, and puts
 * level 9 only on 13f $200–240 and 12f $210.
 */
export const CELL_SHADE = [
  "CCCCCCC",
  "CCCCGGG",
  "CGGGGCC",
  "GGCCCCG",
  "CCCGGGG",
  "GGGGCCC",
  "GCCCCGG",
  "CCGGGGC",
  "GGGCCCC",
  "CCCCGGG",
  "CGGGGCC",
  "GGCCCCG",
  "CCCGGGG",
];

/** Level of each printed cream/green patch, numbered from the bottom. */
export const LEVEL_CELLS = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 2, 2],
  [1, 1, 2, 2, 2, 2, 3],
  [2, 2, 2, 3, 3, 3, 3],
  [3, 3, 3, 3, 4, 4, 4],
  [3, 4, 4, 4, 4, 5, 5],
  [4, 4, 5, 5, 5, 5, 6],
  [5, 5, 5, 6, 6, 6, 6],
  [6, 6, 6, 6, 7, 7, 7],
  [6, 7, 7, 7, 7, 8, 8],
  [7, 7, 8, 8, 8, 8, 9],
  [8, 8, 8, 9, 9, 9, 9],
];

export function levelForCell(row, col) {
  const r = Math.max(0, Math.min(MAX_ROW, row));
  const c = Math.max(0, Math.min(MAX_COL, col));
  return LEVEL_CELLS[r][c];
}

/** Highest area touched by any cell in the row (for badges). */
export function levelForRow(row) {
  const r = Math.max(0, Math.min(MAX_ROW, row));
  return Math.max(...LEVEL_CELLS[r]);
}

export function parseMibsCount(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, n));
}

function parseDifficulty(value) {
  return String(value || "hard").toLowerCase().includes("easy") ? "easy" : "hard";
}

function countFromPacked(value) {
  const raw = String(value ?? "");
  if (!raw.includes(":")) return null;
  const n = Math.floor(Number(raw.split(":")[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Solo lobby payload. Always send one object from the browser — some
 * Socket.IO proxies drop a second argument, which used to seat only one automa.
 * Accepts `{ difficulty: "hard:4", mibsCount: 4 }`, `( "hard", 4 )`, or `"hard:4"`.
 */
export function parseSoloPayload(a, b) {
  const src = a && typeof a === "object" && !Array.isArray(a) ? a : {};
  const diffRaw =
    typeof a === "string"
      ? a
      : src.packed ?? src.difficulty ?? src.diff ?? src.mibsDifficulty ?? "hard";
  const packed = countFromPacked(diffRaw);
  const raw =
    packed ??
    src.mibsCount ??
    src.count ??
    src.automas ??
    src.n ??
    (typeof a === "number" ? a : null) ??
    b;
  return {
    difficulty: parseDifficulty(diffRaw),
    mibsCount: parseMibsCount(raw),
  };
}

export function boardSpec(playerCount) {
  const five = playerCount === 5;
  return {
    playerCount,
    fivePlayer: five,
    initialMarket: five ? 5 : 4,
    removeFromBox: five ? 0 : 1,
    purchaseTrackSize: five ? 6 : 5,
    goldTrackSize: five ? 6 : 5,
    saleTriggerRemaining: five ? 4 : 5,
  };
}
