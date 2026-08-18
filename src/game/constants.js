export const COLORS = ["purple", "yellow", "green", "blue", "white"];

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
 * Highest token row maps to a level area. $110 (row 7) activates level 6.
 * Level 0 covers the bottom two rows; level 9 covers the top three.
 */
export function levelForRow(row) {
  if (row <= 1) return 0;
  if (row >= 10) return 9;
  return row - 1;
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
