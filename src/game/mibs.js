import {
  COLORS,
  COLOR_ORDER,
} from "./constants.js";
import {
  goldLimit,
  goldPrice,
  shareLimit,
  sharePrice,
  validateAction,
} from "./engine.js";

function total(counts) {
  return COLORS.reduce((s, c) => s + (counts[c] || 0), 0);
}

function colorIndex(color) {
  return COLOR_ORDER.indexOf(color);
}

function cheapestColors(state) {
  const available = COLORS.filter((c) => state.market[c] > 0);
  available.sort((a, b) => {
    const pa = sharePrice(state, a);
    const pb = sharePrice(state, b);
    if (pa !== pb) return pa - pb;
    if (state.market[a] !== state.market[b]) return state.market[a] - state.market[b];
    return colorIndex(a) - colorIndex(b);
  });
  return available;
}

function buyCheapestBasket(state, player, limit) {
  const buys = { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 };
  let remaining = limit;
  let cost = 0;
  const order = cheapestColors(state);
  for (const color of order) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, state.market[color]);
    if (!take) continue;
    const price = sharePrice(state, color);
    const afford = Math.floor((player.cash - cost) / price);
    const n = Math.min(take, Math.max(0, afford));
    if (!n) continue;
    buys[color] = n;
    cost += n * price;
    remaining -= n;
  }
  return { buys, cost, count: limit - remaining };
}

function goldBasket(state, player, limit) {
  const price = goldPrice(state);
  const afford = price === 0 ? limit : Math.floor(player.cash / price);
  const count = Math.min(limit, Math.max(0, afford));
  return { count, cost: count * price };
}

function pickByOrder(candidates, comparators) {
  const list = [...candidates];
  list.sort((a, b) => {
    for (const cmp of comparators) {
      const d = cmp(a, b);
      if (d) return d;
    }
    return 0;
  });
  return list[0];
}

function mostHeld(player, color) {
  return player.shares[color] || 0;
}

function chooseBuyTrackColor(state, player, boughtColors, easy) {
  const after = { ...state.market };
  // Approximate: we will take bought shares first in applyAction, then the track share.
  for (const c of COLORS) after[c] = Math.max(0, after[c] - (boughtColors[c] || 0));
  let preferred = COLORS.filter((c) => (boughtColors[c] || 0) > 0 && after[c] > 0);
  if (!preferred.length) preferred = COLORS.filter((c) => after[c] > 0);
  if (!preferred.length) preferred = COLORS.filter((c) => state.market[c] > 0);
  if (!preferred.length) return COLORS[0];
  if (easy) return state.rng.pick(preferred) || preferred[0];
  return pickByOrder(preferred, [
    (a, b) => mostHeld(player, b) - mostHeld(player, a),
    (a, b) => sharePrice(state, b) - sharePrice(state, a),
    (a, b) => after[a] - after[b],
    (a, b) => colorIndex(a) - colorIndex(b),
  ]);
}

function chooseGoldTrackColor(state, player, easy) {
  const ownedPresent = COLORS.filter((c) => player.shares[c] > 0 && state.market[c] > 0);
  const pool = ownedPresent.length ? ownedPresent : COLORS.filter((c) => state.market[c] > 0);
  if (!pool.length) return COLORS[0];
  if (easy) return state.rng.pick(pool) || pool[0];
  if (ownedPresent.length) {
    return pickByOrder(ownedPresent, [
      (a, b) => mostHeld(player, b) - mostHeld(player, a),
      (a, b) => sharePrice(state, b) - sharePrice(state, a),
      (a, b) => state.market[a] - state.market[b],
      (a, b) => colorIndex(a) - colorIndex(b),
    ]);
  }
  return pickByOrder(pool, [
    (a, b) => sharePrice(state, a) - sharePrice(state, b),
    (a, b) => state.market[b] - state.market[a],
    (a, b) => colorIndex(a) - colorIndex(b),
  ]);
}

function sellBasket(state, player, limit) {
  const sells = { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 };
  let remaining = limit;
  const order = [...COLORS].sort((a, b) => {
    const pa = sharePrice(state, a);
    const pb = sharePrice(state, b);
    if (pa !== pb) return pb - pa;
    if (player.shares[a] !== player.shares[b]) return player.shares[b] - player.shares[a];
    return colorIndex(a) - colorIndex(b);
  });
  for (const color of order) {
    if (remaining <= 0) break;
    const n = Math.min(remaining, player.shares[color]);
    if (!n) continue;
    sells[color] = n;
    remaining -= n;
  }
  return { sells, count: limit - remaining };
}

function chooseSaleTrackColor(state, player, sold, easy) {
  const track = state.saleTracks[state.currentSaleTrack];
  const soldOnTrack = COLORS.filter((c) => (sold[c] || 0) > 0 && track.colored[c] > 0);
  const pool = soldOnTrack.length
    ? soldOnTrack
    : COLORS.filter((c) => track.colored[c] > 0);
  if (!pool.length) return COLORS.find((c) => (sold[c] || 0) > 0) || "purple";
  if (easy) return state.rng.pick(pool) || pool[0];
  if (soldOnTrack.length) {
    return pickByOrder(soldOnTrack, [
      (a, b) => mostHeld(player, a) - mostHeld(player, b),
      (a, b) => sharePrice(state, a) - sharePrice(state, b),
      (a, b) => state.market[b] - state.market[a],
      (a, b) => colorIndex(a) - colorIndex(b),
    ]);
  }
  return pickByOrder(pool, [
    (a, b) => sharePrice(state, b) - sharePrice(state, a),
    (a, b) => mostHeld(player, a) - mostHeld(player, b),
    (a, b) => colorIndex(a) - colorIndex(b),
  ]);
}

export function decideMibsAction(state, playerId) {
  const player = playerId
    ? state.players.find((p) => p.id === playerId)
    : state.players[state.turnIndex];
  if (!player?.isMibs) throw new Error("No M.I.B.S. to act");
  const easy = player.mibsDifficulty === "easy";
  const limit = shareLimit(state, player);
  const gLimit = goldLimit(state, player);

  const maxShares = buyCheapestBasket(state, player, limit);
  const maxGold = goldBasket(state, player, gLimit);
  const canMaxShares = maxShares.count === limit && limit > 0;
  const canMaxGold = maxGold.count === gLimit && gLimit > 0;

  const jitter = easy && state.rng.next() < 0.3;

  if ((canMaxShares || canMaxGold) && !jitter) {
    const shareCost = maxShares.cost;
    const goldCost = maxGold.cost;
    if (canMaxShares && (!canMaxGold || shareCost <= goldCost)) {
      return {
        type: "buyShares",
        buys: maxShares.buys,
        trackColor: chooseBuyTrackColor(state, player, maxShares.buys, easy),
      };
    }
    return {
      type: "buyGold",
      count: maxGold.count,
      trackColor: chooseGoldTrackColor(state, player, easy),
    };
  }

  if (total(player.shares) > 0) {
    const sold = sellBasket(state, player, limit);
    return {
      type: "sellShares",
      sells: sold.sells,
      trackColor: chooseSaleTrackColor(state, player, sold.sells, easy),
    };
  }

  const partialShares = buyCheapestBasket(state, player, limit);
  const partialGold = goldBasket(state, player, gLimit);
  if (partialShares.count > 0 || partialGold.count > 0) {
    if (partialGold.count === 0 || (partialShares.count > 0 && partialShares.cost <= partialGold.cost)) {
      return {
        type: "buyShares",
        buys: partialShares.buys,
        trackColor: chooseBuyTrackColor(state, player, partialShares.buys, easy),
      };
    }
    return {
      type: "buyGold",
      count: partialGold.count,
      trackColor: chooseGoldTrackColor(state, player, easy),
    };
  }

  const cheapest = cheapestColors(state)[0] || "purple";
  return {
    type: "buyGold",
    count: 0,
    trackColor: cheapest,
  };
}

function emptyBasket() {
  return { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 };
}

/** Always-legal park: buy zero gold, or dump a sale-track color. */
export function guaranteedAction(state) {
  const marketColor = COLORS.find((c) => state.market[c] > 0);
  if (marketColor) {
    return { type: "buyGold", count: 0, trackColor: marketColor };
  }
  const track = state.saleTracks[state.currentSaleTrack];
  const saleColor = COLORS.find((c) => (track?.colored[c] || 0) > 0);
  return {
    type: "sellShares",
    sells: emptyBasket(),
    trackColor: saleColor || "purple",
  };
}

/** Prefer the printed M.I.B.S. policy; never return an illegal action. */
export function decideLegalMibsAction(state, playerId) {
  const planned = decideMibsAction(state, playerId);
  if (!validateAction(state, playerId, planned)) return planned;
  return guaranteedAction(state);
}
