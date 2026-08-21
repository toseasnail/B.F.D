import {
  BLACK_SHARES,
  BONUS_POWERS,
  COLORS,
  COLOR_ORDER,
  CHEAP_SETUP_POS,
  EXPENSIVE_SETUP_POS,
  GOLD_TRACK,
  LEVELS,
  MAX_COL,
  MAX_ROW,
  SHARES_PER_COLOR,
  SMALL_GOLD_VALUE,
  BIG_GOLD_VALUE,
  SMALL_PER_BIG,
  START_PRICE_POS,
  boardSpec,
  cloneCounts,
  DESK_VERSION,
  emptyColorCounts,
  levelForCell,
  parseMibsCount,
  priceAt,
  totalCounts,
} from "./constants.js";
import { createRng } from "./rng.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addLog(state, text, extra = {}) {
  state.log.push({ id: state.log.length + 1, text, ...extra });
}

function posPrice(pos) {
  return priceAt(pos);
}

function stepOnce(pos, dir) {
  const next = { row: pos.row, col: pos.col };
  if (dir === "right") {
    if (next.col < MAX_COL) next.col += 1;
    else if (next.row < MAX_ROW) next.row += 1;
  } else if (dir === "left") {
    if (next.col > 0) next.col -= 1;
    else if (next.row > 0) next.row -= 1;
  } else if (dir === "up") {
    if (next.row < MAX_ROW) next.row += 1;
    else if (next.col < MAX_COL) next.col += 1;
  } else if (dir === "down") {
    if (next.row > 0) next.row -= 1;
    else if (next.col > 0) next.col -= 1;
  }
  return next;
}

function moveSteps(pos, dirs) {
  let current = { ...pos };
  for (const dir of dirs) current = stepOnce(current, dir);
  return current;
}

/** Relative move used during a price change (net drawn shares). */
export function priceChangeDirs(net) {
  if (net === 0) return ["left"];
  const sign = net > 0 ? 1 : -1;
  const abs = Math.abs(net);
  const extra = Math.max(0, abs - 6);
  const base = Math.min(abs, 6);
  const vertical = Math.ceil(base / 2) + extra;
  const diagonal = base % 2 === 0 ? 1 : 0;
  const vDir = sign > 0 ? "up" : "down";
  const hDir = sign > 0 ? "right" : "left";
  const dirs = [];
  for (let i = 0; i < vertical; i++) dirs.push(vDir);
  if (diagonal) dirs.push(hDir);
  return dirs;
}

function raiseRight(state, color) {
  state.prices[color] = stepOnce(state.prices[color], "right");
}

function raiseUp(state, color) {
  state.prices[color] = stepOnce(state.prices[color], "up");
}

function dropLeft(state, color) {
  state.prices[color] = stepOnce(state.prices[color], "left");
}

function takeFromMarket(state, color, n = 1) {
  const taken = Math.min(n, state.market[color]);
  state.market[color] -= taken;
  return taken;
}

function putOnMarket(state, color, n = 1) {
  state.market[color] += n;
}

function drawFromBag(state, n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (state.bag.length === 0) break;
    const idx = state.rng.int(state.bag.length);
    drawn.push(state.bag.splice(idx, 1)[0]);
  }
  return drawn;
}

function putInBag(state, shares) {
  for (const share of shares) state.bag.push(share);
}

function convertGold(player) {
  while (player.smallGold >= SMALL_PER_BIG) {
    player.smallGold -= SMALL_PER_BIG;
    player.bigGold += 1;
  }
}

function currentLevelInfo(state) {
  return LEVELS[state.level];
}

function saleColoredCount(track) {
  return totalCounts(track.colored);
}

function trackHasColor(track, color) {
  return (track.colored[color] || 0) > 0;
}

function anyTrackColor(track) {
  return COLORS.filter((c) => track.colored[c] > 0);
}

function thirdOfColor(list, color) {
  return list.filter((c) => c === color).length === 3;
}

function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

function currentPlayer(state) {
  return state.players[state.turnIndex];
}

function countOnTrack(list, color) {
  return list.filter((c) => c === color).length;
}

function makeSaleTrack(black) {
  return {
    colored: { purple: 2, yellow: 2, green: 2, blue: 2, white: 2 },
    black,
  };
}

function makePlayer({ id, name, isMibs, bonusTile, mibsDifficulty }) {
  return {
    id,
    name,
    isMibs: Boolean(isMibs),
    mibsDifficulty: isMibs ? mibsDifficulty || "hard" : null,
    cash: 100,
    shares: emptyColorCounts(),
    smallGold: 0,
    bigGold: 0,
    bonusTile: bonusTile ?? null,
    bonusUsed: false,
    connected: true,
  };
}

function setupBagAndMarket(state, spec) {
  const bag = [];
  for (const color of COLORS) {
    const inBox = spec.removeFromBox;
    const onMarket = spec.initialMarket;
    const remaining = SHARES_PER_COLOR - inBox - onMarket;
    state.market[color] = onMarket;
    for (let i = 0; i < remaining; i++) bag.push(color);
  }
  state.bag = bag;
}

function applyInitialPrices(state) {
  for (const color of COLORS) state.prices[color] = { ...START_PRICE_POS };
  const counts = COLORS.map((color) => ({ color, n: state.market[color] }));
  const min = Math.min(...counts.map((c) => c.n));
  const max = Math.max(...counts.map((c) => c.n));
  if (min === max) return;
  for (const { color, n } of counts) {
    if (n === min) state.prices[color] = { ...EXPENSIVE_SETUP_POS };
    if (n === max) state.prices[color] = { ...CHEAP_SETUP_POS };
  }
}

export function resolveMibsCount(humanCount, includeMibs = false, mibsCount = 1) {
  if (humanCount < 1 || humanCount >= 5) return 0;
  const requested = parseMibsCount(mibsCount);
  const room = 5 - humanCount;
  if (humanCount === 1) return Math.min(requested, room);
  if (humanCount === 2) return 1;
  if (includeMibs) return Math.min(1, room);
  return 0;
}

function mibsSeatId(index) {
  return index === 0 ? "mibs" : `mibs-${index + 1}`;
}

function mibsSeatName(index, count, difficulty) {
  const diff = difficulty === "easy" ? "Easy" : "Hard";
  return `M.I.B.S. ${index + 1}/${count} (${diff})`;
}

export function createGame({
  players,
  includeMibs = false,
  mibsCount = 1,
  mibsDifficulty,
  difficulty,
  seed = Date.now() % 2 ** 32,
} = {}) {
  const humans = players.map((p, i) => ({
    id: p.id,
    name: p.name || `Player ${i + 1}`,
  }));
  if (humans.length < 1) throw new Error("Need at least one player");

  const automas = resolveMibsCount(humans.length, includeMibs, mibsCount);
  if (humans.length + automas > 5) {
    throw new Error("Black Friday supports at most 5 players");
  }

  const withMibs = automas > 0;
  const totalPlayers = humans.length + automas;
  const spec = boardSpec(totalPlayers >= 5 ? 5 : Math.max(2, totalPlayers));
  const mibsDiff = (mibsDifficulty || difficulty) === "easy" ? "easy" : "hard";

  const rng = createRng(seed);
  const state = {
    id: `g_${seed.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    seed,
    rng,
    status: "playing",
    spec,
    level: 0,
    goldIndex: 0,
    purchasedGold: 0,
    market: emptyColorCounts(),
    bag: [],
    bankBlack: 0,
    levelBlacks: [true, true, true, true, true, true, true, true, true],
    prices: {},
    purchaseTrack: [],
    goldPurchaseTrack: [],
    saleTracks: [makeSaleTrack(1), makeSaleTrack(2), makeSaleTrack(3)],
    currentSaleTrack: 0,
    saleRestockLoop: false,
    salePriceChanges: 0,
    salePhase: "t1",
    players: [],
    turnIndex: 0,
    log: [],
    lastPriceChange: null,
    winnerIds: [],
    scores: [],
    mibsDifficulty: withMibs ? mibsDiff : null,
    mibsCount: automas,
  };

  setupBagAndMarket(state, spec);

  const extra = drawFromBag(state, 20);
  for (const color of extra) putOnMarket(state, color, 1);

  applyInitialPrices(state);

  const seated = [];
  for (let i = 0; i < automas; i++) {
    seated.push(
      makePlayer({
        id: mibsSeatId(i),
        name: mibsSeatName(i, automas, mibsDiff),
        isMibs: true,
        bonusTile: null,
        mibsDifficulty: mibsDiff,
      })
    );
  }
  humans.forEach((human, i) => {
    const turnPos = seated.length + 1;
    seated.push(
      makePlayer({
        id: human.id,
        name: human.name,
        bonusTile: turnPos === 1 && !withMibs ? null : Math.min(turnPos, 5),
      })
    );
  });

  for (const player of seated) {
    const hand = drawFromBag(state, 5);
    for (const color of hand) player.shares[color] += 1;
  }

  state.players = seated;
  // MIBS always starts when present.
  state.turnIndex = 0;
  addLog(
    state,
    `Market opens. ${seated.map((p) => p.name).join(", ")} sit down to trade.`
  );
  addLog(state, `${currentPlayer(state).name} takes the first turn.`);
  return state;
}

export function goldPrice(state) {
  return GOLD_TRACK[state.goldIndex];
}

export function sharePrice(state, color) {
  return posPrice(state.prices[color]);
}

function shareLimit(state, player, extra = 0) {
  let limit = currentLevelInfo(state).shareLimit;
  if (player.isMibs && player.mibsDifficulty === "easy") limit = Math.max(1, limit - 1);
  return limit + extra;
}

function goldLimit(state, player, extra = 0) {
  let limit = currentLevelInfo(state).goldLimit;
  if (player.isMibs && player.mibsDifficulty === "easy") limit = Math.max(1, limit - 1);
  return limit + extra;
}

function placeOnPurchase(state, color) {
  if (state.market[color] <= 0) return false;
  takeFromMarket(state, color, 1);
  if (state.market[color] === 0) raiseRight(state, color);
  state.purchaseTrack.push(color);
  if (thirdOfColor(state.purchaseTrack, color)) raiseRight(state, color);
  return true;
}

function placeOnGoldTrack(state, color) {
  if (state.market[color] <= 0) return false;
  takeFromMarket(state, color, 1);
  if (state.market[color] === 0) raiseRight(state, color);
  state.goldPurchaseTrack.push(color);
  if (thirdOfColor(state.goldPurchaseTrack, color)) raiseRight(state, color);
  return true;
}

function removeFromSaleTrack(state, color) {
  const track = state.saleTracks[state.currentSaleTrack];
  if (!trackHasColor(track, color)) return false;
  track.colored[color] -= 1;
  putOnMarket(state, color, 1);
  dropLeft(state, color);
  return true;
}

function maybePriceChange(state, source) {
  const spec = state.spec;
  if (source === "purchase" && state.purchaseTrack.length >= spec.purchaseTrackSize) {
    return runPriceChange(state, "purchase");
  }
  if (source === "gold" && state.goldPurchaseTrack.length >= spec.goldTrackSize) {
    return runPriceChange(state, "gold");
  }
  if (source === "sale") {
    const remaining = saleColoredCount(state.saleTracks[state.currentSaleTrack]);
    if (remaining <= spec.saleTriggerRemaining) return runPriceChange(state, "sale");
  }
  return false;
}

function runPriceChange(state, source) {
  const drawN = currentLevelInfo(state).drawCount;
  const drawn = drawFromBag(state, drawN);
  const counts = emptyColorCounts();
  let black = 0;
  for (const share of drawn) {
    if (share === "black") black += 1;
    else counts[share] += 1;
  }

  const goldStart = goldPrice(state);
  state.goldIndex = Math.min(GOLD_TRACK.length - 1, state.goldIndex + black);
  const goldFromPurchases = Math.floor(state.purchasedGold / 3);
  state.goldIndex = Math.min(GOLD_TRACK.length - 1, state.goldIndex + goldFromPurchases);
  state.purchasedGold = 0;

  let nets = {};
  const returnedBlack = [];
  if (black === 1) {
    returnedBlack.push("black");
    for (const color of COLORS) nets[color] = counts[color];
  } else if (black >= 2) {
    state.bankBlack += black;
    for (const color of COLORS) nets[color] = counts[color] - black;
  } else {
    for (const color of COLORS) nets[color] = counts[color];
  }

  const moves = {};
  for (const color of COLORS) {
    const dirs = priceChangeDirs(nets[color]);
    const from = { ...state.prices[color] };
    state.prices[color] = moveSteps(state.prices[color], dirs);
    moves[color] = {
      net: nets[color],
      from,
      to: { ...state.prices[color] },
      fromPrice: posPrice(from),
      toPrice: sharePrice(state, color),
    };
  }

  for (const color of COLORS) {
    putOnMarket(state, color, counts[color]);
  }
  putInBag(state, returnedBlack);

  if (source === "purchase") {
    putInBag(state, state.purchaseTrack);
    state.purchaseTrack = [];
  } else if (source === "gold") {
    putInBag(state, state.goldPurchaseTrack);
    state.goldPurchaseTrack = [];
  } else if (source === "sale") {
    const track = state.saleTracks[state.currentSaleTrack];
    const dumped = [];
    for (const color of COLORS) {
      for (let i = 0; i < track.colored[color]; i++) dumped.push(color);
      track.colored[color] = 0;
    }
    for (let i = 0; i < track.black; i++) dumped.push("black");
    track.black = 0;
    putInBag(state, dumped);
  }

  for (const color of COLORS) {
    if (state.market[color] === 0) raiseUp(state, color);
  }

  const newLevel = Math.max(
    ...COLORS.map((c) => levelForCell(state.prices[c].row, state.prices[c].col))
  );
  if (newLevel > state.level) {
    for (let lvl = state.level + 1; lvl <= newLevel; lvl++) {
      const idx = lvl - 1;
      if (state.levelBlacks[idx]) {
        state.levelBlacks[idx] = false;
        putInBag(state, ["black"]);
      }
    }
    state.level = newLevel;
    addLog(state, `The market heats up — level ${newLevel} is now active.`);
  }

  if (source === "sale") advanceSaleTrack(state);

  const ended = goldPrice(state) >= 100;
  state.lastPriceChange = {
    source,
    drawn,
    black,
    nets,
    moves,
    goldFrom: goldStart,
    goldTo: goldPrice(state),
    goldFromPurchases,
  };
  addLog(
    state,
    `Price change (${source}): drew ${drawn.length} shares (${black} black). Gold ${goldStart} → ${goldPrice(state)}.`
  );

  if (ended) endGame(state);
  return ended;
}

/** Official restock: only the center (track 2). 2 of each color from the market, 2 black from the bank. */
function refillCenterSaleTrack(state) {
  const track = state.saleTracks[1];
  for (const color of COLORS) {
    const want = Math.max(0, 2 - (track.colored[color] || 0));
    const take = Math.min(want, state.market[color] || 0);
    if (!take) continue;
    takeFromMarket(state, color, take);
    track.colored[color] += take;
    if (state.market[color] === 0) raiseRight(state, color);
  }
  const needBlack = Math.max(0, 2 - track.black);
  const takeBlack = Math.min(needBlack, state.bankBlack);
  track.black += takeBlack;
  state.bankBlack -= takeBlack;
  addLog(
    state,
    `The center share-sale track is restocked from the market (${saleColoredCount(track)} colored, ${track.black} black). Short spaces stay empty.`
  );
}

/**
 * Opening: 1 → 2 → 3 (no restock). After the third track is spent, only the
 * center track is used for the rest of the game, and it is restocked each time.
 * Track 3 is never restocked.
 */
function advanceSaleTrack(state) {
  state.salePriceChanges = (state.salePriceChanges || 0) + 1;
  const n = state.salePriceChanges;
  if (n === 1) {
    state.currentSaleTrack = 1;
    state.salePhase = "t2";
    addLog(state, "Share-sale track 1 is spent. Now using track 2. Do not restock yet.");
    return;
  }
  if (n === 2) {
    state.currentSaleTrack = 2;
    state.salePhase = "t3";
    addLog(
      state,
      "Share-sale track 2 is spent. Now using track 3. Restock the center only after track 3 is spent."
    );
    return;
  }
  state.saleRestockLoop = true;
  state.salePhase = "center";
  refillCenterSaleTrack(state);
  state.currentSaleTrack = 1;
  addLog(
    state,
    n === 3
      ? "Share-sale track 3 is spent. Track 3 stays empty. Only the center is used and restocked from now on."
      : "The center share-sale track is spent and restocked again from the market."
  );
}

function fortune(player) {
  return player.cash + player.smallGold * SMALL_GOLD_VALUE + player.bigGold * BIG_GOLD_VALUE;
}

function goldWealth(player) {
  return player.smallGold + player.bigGold * SMALL_PER_BIG;
}

function endGame(state) {
  if (state.status === "ended") return;
  state.status = "ended";
  for (const player of state.players) {
    for (const color of COLORS) {
      const n = player.shares[color];
      if (!n) continue;
      player.cash += n * sharePrice(state, color);
      putOnMarket(state, color, n);
      player.shares[color] = 0;
    }
  }
  const scored = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: p.cash,
    goldBars: goldWealth(p),
    goldValue: p.smallGold * SMALL_GOLD_VALUE + p.bigGold * BIG_GOLD_VALUE,
    total: fortune(p),
  }));
  scored.sort((a, b) => b.total - a.total || b.goldValue - a.goldValue);
  const best = scored[0];
  const winners = scored.filter(
    (s) => s.total === best.total && s.goldValue === best.goldValue
  );
  state.scores = scored;
  state.winnerIds = winners.map((w) => w.id);
  addLog(
    state,
    `Black Friday! ${winners.map((w) => w.name).join(" & ")} win with $${best.total}.`
  );
}

function bonusPowers(player) {
  if (!player.bonusTile || player.bonusUsed) return [];
  return BONUS_POWERS[player.bonusTile] || [];
}

function pickTrackColor(state, preferred, fallbackAny = true) {
  const availablePreferred = preferred.filter((c) => state.market[c] > 0);
  if (availablePreferred.length) return availablePreferred[0];
  if (!fallbackAny) return null;
  const any = COLORS.filter((c) => state.market[c] > 0);
  return any[0] || null;
}

/** Rewrite trackColor so a ticket is legal whenever the buy/sell/gold itself is. */
export function normalizeAction(state, action = {}) {
  const next = {
    ...action,
    buys: action.buys ? { ...action.buys } : action.buys,
    sells: action.sells ? { ...action.sells } : action.sells,
  };
  if (next.type === "buyShares") {
    const buys = next.buys || emptyColorCounts();
    const after = cloneCounts(state.market);
    for (const color of COLORS) after[color] = Math.max(0, after[color] - (buys[color] || 0));
    const bought = COLORS.filter((c) => (buys[c] || 0) > 0);
    const preferred = bought.filter((c) => after[c] > 0);
    const pool = preferred.length ? preferred : COLORS.filter((c) => after[c] > 0);
    if (pool.length && !pool.includes(next.trackColor)) next.trackColor = pool[0];
  } else if (next.type === "sellShares") {
    const sells = next.sells || emptyColorCounts();
    const track = state.saleTracks[state.currentSaleTrack];
    const sold = COLORS.filter((c) => (sells[c] || 0) > 0);
    const preferred = sold.filter((c) => trackHasColor(track, c));
    const pool = preferred.length ? preferred : COLORS.filter((c) => trackHasColor(track, c));
    if (pool.length && !pool.includes(next.trackColor)) next.trackColor = pool[0];
  } else if (next.type === "buyGold") {
    if (!(state.market[next.trackColor] > 0)) {
      next.trackColor = COLORS.find((c) => state.market[c] > 0) || next.trackColor;
    }
  }
  return next;
}

export function skipTurn(state) {
  if (state.status !== "playing") return;
  addLog(state, `${currentPlayer(state).name} cannot stamp and passes.`);
  nextTurn(state);
}

export function validateAction(state, playerId, action) {
  if (state.status !== "playing") return "The game is over.";
  const player = playerById(state, playerId);
  if (!player) return "Unknown player.";
  if (currentPlayer(state).id !== playerId) return `It is ${currentPlayer(state).name}'s turn.`;
  if (!action || !action.type) return "Choose an action.";

  const powers = bonusPowers(player);
  if (action.bonus && !powers.includes(action.bonus)) {
    return "That bonus is not available.";
  }

  const extraBuy = action.bonus === "extraBuy" ? 1 : 0;
  const extraSell = action.bonus === "extraSell" ? 1 : 0;
  const extraGold = action.bonus === "extraGold" ? 1 : 0;

  if (action.type === "buyShares") {
    const buys = action.buys || {};
    const total = totalCounts(buys);
    if (total > shareLimit(state, player, extraBuy)) {
      return `You may buy at most ${shareLimit(state, player, extraBuy)} shares.`;
    }
    let cost = 0;
    for (const color of COLORS) {
      const n = buys[color] || 0;
      if (n < 0) return "Invalid purchase.";
      if (n > state.market[color]) return `Not enough ${color} shares in the market.`;
      cost += n * sharePrice(state, color);
    }
    if (cost > player.cash) return "Not enough cash.";
    const chosen = action.trackColor;
    if (!chosen || !COLORS.includes(chosen)) return "Choose a color for the purchase track.";
    const boughtColors = COLORS.filter((c) => (buys[c] || 0) > 0);
    const marketAfter = cloneCounts(state.market);
    for (const color of COLORS) marketAfter[color] -= buys[color] || 0;
    if (total === 0) {
      if (marketAfter[chosen] <= 0) return "That color is not in the market.";
    } else {
      const preferred = boughtColors.filter((c) => marketAfter[c] > 0);
      if (preferred.length && !preferred.includes(chosen)) {
        return "Place a share of a color you just bought, if any remain.";
      }
      if (marketAfter[chosen] <= 0) return "That color is not in the market.";
    }
    return null;
  }

  if (action.type === "sellShares") {
    const sells = action.sells || {};
    const total = totalCounts(sells);
    if (total > shareLimit(state, player, extraSell)) {
      return `You may sell at most ${shareLimit(state, player, extraSell)} shares.`;
    }
    for (const color of COLORS) {
      const n = sells[color] || 0;
      if (n < 0) return "Invalid sale.";
      if (n > player.shares[color]) return `You do not have that many ${color} shares.`;
    }
    const track = state.saleTracks[state.currentSaleTrack];
    const trackColors = COLORS.filter((c) => trackHasColor(track, c));
    if (trackColors.length) {
      const chosen = action.trackColor;
      if (!chosen || !COLORS.includes(chosen)) return "Choose a color to take from the sale track.";
      const soldColors = COLORS.filter((c) => (sells[c] || 0) > 0);
      if (total === 0) {
        if (!trackHasColor(track, chosen)) return "That color is not on the current sale track.";
      } else {
        const preferred = soldColors.filter((c) => trackHasColor(track, c));
        if (preferred.length && !preferred.includes(chosen)) {
          return "Remove a share of a color you just sold, if any remain on the track.";
        }
        if (!trackHasColor(track, chosen)) return "That color is not on the current sale track.";
      }
    }
    return null;
  }

  if (action.type === "buyGold") {
    const count = action.count ?? 0;
    if (count < 0 || count > goldLimit(state, player, extraGold)) {
      return `You may buy at most ${goldLimit(state, player, extraGold)} gold bars.`;
    }
    const cost = count * goldPrice(state);
    if (cost > player.cash) return "Not enough cash.";
    const chosen = action.trackColor;
    if (!chosen || !COLORS.includes(chosen)) return "Choose a color for the gold-purchase track.";
    if (state.market[chosen] <= 0) return "That color is not in the market.";
    return null;
  }

  return "Unknown action.";
}

function applyManipulate(state, player, action) {
  const target = action.manipulateTarget;
  const color = action.manipulateColor;
  if (!target || !color) return "Choose how to use the bonus manipulate.";
  if (target === "purchase") {
    if (state.market[color] <= 0) return "That color is not in the market.";
    placeOnPurchase(state, color);
    addLog(state, `${player.name} uses a bonus to place ${color} on the purchase track.`);
    return maybePriceChange(state, "purchase") ? "ended" : null;
  }
  if (target === "gold") {
    if (state.market[color] <= 0) return "That color is not in the market.";
    placeOnGoldTrack(state, color);
    addLog(state, `${player.name} uses a bonus to place ${color} on the gold track.`);
    return maybePriceChange(state, "gold") ? "ended" : null;
  }
  if (target === "sale") {
    const track = state.saleTracks[state.currentSaleTrack];
    if (!trackHasColor(track, color)) return "That color is not on the current sale track.";
    removeFromSaleTrack(state, color);
    addLog(state, `${player.name} uses a bonus to pull ${color} from the sale track.`);
    return maybePriceChange(state, "sale") ? "ended" : null;
  }
  return "Invalid bonus target.";
}

export function applyAction(state, playerId, action) {
  const normalized = normalizeAction(state, action);
  const error = validateAction(state, playerId, normalized);
  if (error) return { ok: false, error, state };
  const player = playerById(state, playerId);
  action = normalized;

  if (action.bonus) {
    player.bonusUsed = true;
    if (action.bonus === "manipulate") {
      const result = applyManipulate(state, player, action);
      if (result && result !== "ended") return { ok: false, error: result, state };
      if (state.status === "ended") return { ok: true, state };
    }
  }

  if (action.type === "buyShares") {
    const buys = action.buys || {};
    const total = totalCounts(buys);
    let spent = 0;
    for (const color of COLORS) {
      const n = buys[color] || 0;
      if (!n) continue;
      const price = sharePrice(state, color);
      player.cash -= n * price;
      spent += n * price;
      takeFromMarket(state, color, n);
      player.shares[color] += n;
      if (state.market[color] === 0) raiseRight(state, color);
    }
    placeOnPurchase(state, action.trackColor);
    addLog(
      state,
      total === 0
        ? `${player.name} buys no shares and parks ${action.trackColor} on the purchase track.`
        : `${player.name} buys ${describeCounts(buys)} for $${spent}.`
    );
    maybePriceChange(state, "purchase");
  } else if (action.type === "sellShares") {
    const sells = action.sells || {};
    const total = totalCounts(sells);
    let gained = 0;
    for (const color of COLORS) {
      const n = sells[color] || 0;
      if (!n) continue;
      const price = sharePrice(state, color);
      player.shares[color] -= n;
      putOnMarket(state, color, n);
      player.cash += n * price;
      gained += n * price;
    }
    const saleTrack = state.saleTracks[state.currentSaleTrack];
    const saleBefore = saleColoredCount(saleTrack);
    if (saleBefore > 0) {
      removeFromSaleTrack(state, action.trackColor);
    } else if (total > 0) {
      const soldColor = COLORS.find((c) => (sells[c] || 0) > 0);
      if (soldColor) dropLeft(state, soldColor);
    }
    addLog(
      state,
      total === 0
        ? `${player.name} sells nothing and dumps ${action.trackColor} from the sale track.`
        : `${player.name} sells ${describeCounts(sells)} for $${gained}.`
    );
    const saleAfter = saleColoredCount(state.saleTracks[state.currentSaleTrack]);
    if (saleAfter < saleBefore) maybePriceChange(state, "sale");
    else if (saleBefore === 0 && state.saleRestockLoop) maybePriceChange(state, "sale");
  } else if (action.type === "buyGold") {
    const count = action.count || 0;
    const cost = count * goldPrice(state);
    player.cash -= cost;
    player.smallGold += count;
    convertGold(player);
    state.purchasedGold += count;
    placeOnGoldTrack(state, action.trackColor);
    addLog(
      state,
      count === 0
        ? `${player.name} buys no gold and places ${action.trackColor} on the gold track.`
        : `${player.name} buys ${count} gold for $${cost}.`
    );
    maybePriceChange(state, "gold");
  }

  if (state.status === "playing") nextTurn(state);
  return { ok: true, state };
}

function describeCounts(counts) {
  const parts = COLORS.filter((c) => counts[c]).map((c) => `${counts[c]} ${c}`);
  return parts.join(", ") || "nothing";
}

function nextTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  addLog(state, `${currentPlayer(state).name}'s turn.`);
}

export function publicView(state, viewerId) {
  const clone = deepClone({
    ...state,
    rng: undefined,
    bag: undefined,
  });
  clone.bagCount = state.bag.length;
  clone.goldPrice = goldPrice(state);
  clone.levelInfo = currentLevelInfo(state);
  clone.levelBlacks = [...state.levelBlacks];
  clone.pricesDisplay = {};
  for (const color of COLORS) {
    clone.pricesDisplay[color] = {
      ...state.prices[color],
      price: sharePrice(state, color),
    };
  }
  clone.deskVersion = DESK_VERSION;
  clone.you = viewerId;
  clone.players = state.players.map((p) => {
    const hidden = p.id !== viewerId && !p.isMibs && state.status === "playing";
    if (!hidden) {
      return {
        ...p,
        fortune: fortune(p),
        shareTotal: totalCounts(p.shares),
        goldBars: goldWealth(p),
      };
    }
    return {
      id: p.id,
      name: p.name,
      isMibs: p.isMibs,
      bonusTile: p.bonusTile,
      bonusUsed: p.bonusUsed,
      connected: p.connected,
      hidden: true,
      shareTotal: totalCounts(p.shares),
    };
  });
  clone.currentPlayerId = currentPlayer(state).id;
  clone.yourPowers = (() => {
    const me = playerById(state, viewerId);
    return me ? bonusPowers(me) : [];
  })();
  return clone;
}

export function serializeState(state) {
  const copy = deepClone({ ...state, rng: undefined });
  copy.seed = state.seed;
  copy.rngState = state.rng.seed;
  return copy;
}

export { currentPlayer, playerById, fortune, goldWealth, shareLimit, goldLimit, currentLevelInfo };
