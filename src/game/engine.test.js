import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COLORS, LEVEL_CELLS, PRICE_TABLE, START_PRICE_POS, levelForCell, parseSoloPayload, priceAt } from "./constants.js";
import {
  applyAction,
  createGame,
  goldPrice,
  priceChangeDirs,
  sharePrice,
  validateAction,
} from "./engine.js";
import { decideMibsAction } from "./mibs.js";

describe("price table", () => {
  it("starts on $8 and caps at $240 / $4", () => {
    assert.equal(priceAt(START_PRICE_POS), 8);
    assert.equal(PRICE_TABLE[0][0], 4);
    assert.equal(PRICE_TABLE[12][6], 240);
  });

  it("maps price-change nets the way the overview does", () => {
    assert.deepEqual(priceChangeDirs(0), ["left"]);
    assert.deepEqual(priceChangeDirs(1), ["up"]);
    assert.deepEqual(priceChangeDirs(2), ["up", "right"]);
    assert.deepEqual(priceChangeDirs(4), ["up", "up", "right"]);
    assert.deepEqual(priceChangeDirs(-1), ["down"]);
    assert.deepEqual(priceChangeDirs(-2), ["down", "left"]);
  });

  it("maps printed zigzag areas, with $110 in level 6", () => {
    assert.equal(priceAt({ row: 7, col: 6 }), 110);
    assert.equal(levelForCell(7, 6), 6);
    assert.equal(levelForCell(0, 3), 0);
    assert.equal(levelForCell(12, 6), 9);
    assert.equal(levelForCell(11, 6), 9);
    assert.equal(levelForCell(12, 2), 8);
    // Level 2 chevron: 4f 15–20, 3f 12–25, 2f 15–25
    assert.equal(levelForCell(3, 0), 2);
    assert.equal(levelForCell(3, 1), 2);
    assert.equal(levelForCell(2, 1), 2);
    assert.equal(levelForCell(2, 4), 2);
    assert.equal(levelForCell(1, 4), 2);
    assert.equal(levelForCell(1, 6), 2);
    // Level 3: 7f 45, 6f 35–50, 5f 40–60, 4f 45
    assert.equal(levelForCell(6, 0), 3);
    assert.equal(levelForCell(5, 0), 3);
    assert.equal(levelForCell(5, 3), 3);
    assert.equal(levelForCell(4, 3), 3);
    assert.equal(levelForCell(4, 6), 3);
    assert.equal(levelForCell(3, 6), 3);
    // Level 4: 8f 60–70, 7f 50–75, 6f 60–75
    assert.equal(levelForCell(7, 0), 4);
    assert.equal(levelForCell(7, 1), 4);
    assert.equal(levelForCell(6, 1), 4);
    assert.equal(levelForCell(6, 4), 4);
    assert.equal(levelForCell(5, 4), 4);
    assert.equal(levelForCell(5, 6), 4);
    assert.deepEqual(LEVEL_CELLS[12], [8, 8, 8, 9, 9, 9, 9]);
  });

  it("reads solo automa count from either payload shape", () => {
    assert.equal(parseSoloPayload("easy", 4).mibsCount, 4);
    assert.equal(parseSoloPayload({ difficulty: "hard", mibsCount: "3" }).mibsCount, 3);
  });
});

describe("setup", () => {
  it("gives each trader $100 and 5 shares, and seats M.I.B.S. first", () => {
    const game = createGame({
      players: [{ id: "p1", name: "Jung-hyeon" }],
      includeMibs: true,
      mibsDifficulty: "hard",
      seed: 42,
    });
    assert.equal(game.players[0].id, "mibs");
    assert.equal(game.players[0].isMibs, true);
    assert.equal(game.players[1].bonusTile, 2);
    for (const p of game.players) {
      assert.equal(p.cash, 100);
      const shares = COLORS.reduce((s, c) => s + p.shares[c], 0);
      assert.equal(shares, 5);
    }
    assert.equal(goldPrice(game), 20);
    assert.equal(game.level, 0);
  });

  it("forces M.I.B.S. into a two-human game", () => {
    const game = createGame({
      players: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      includeMibs: false,
      seed: 7,
    });
    assert.equal(game.players.length, 3);
    assert.equal(game.players[0].isMibs, true);
  });
});

describe("actions", () => {
  it("lets a player buy a share and park one on the purchase track", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      seed: 99,
    });
    // Skip MIBS by applying a no-op style action as mibs via decide, then buy as human.
    const mibsAct = decideMibsAction(game);
    const r1 = applyAction(game, "mibs", mibsAct);
    assert.equal(r1.ok, true);
    const human = game.players.find((p) => p.id === "p1");
    const color = COLORS.find((c) => game.market[c] > 1);
    const price = sharePrice(game, color);
    const beforeCash = human.cash;
    const beforeHand = human.shares[color];
    const result = applyAction(game, "p1", {
      type: "buyShares",
      buys: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0, [color]: 1 },
      trackColor: color,
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(human.cash, beforeCash - price);
    assert.equal(human.shares[color], beforeHand + 1);
    assert.ok(game.purchaseTrack.includes(color) || game.purchaseTrack.length === 0);
  });

  it("rejects playing out of turn", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      seed: 1,
    });
    const err = validateAction(game, "p1", {
      type: "buyGold",
      count: 0,
      trackColor: "purple",
    });
    assert.match(err, /turn/i);
  });
});

describe("M.I.B.S.", () => {
  it("returns a legal action on the opening turn", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsDifficulty: "hard",
      seed: 123,
    });
    const action = decideMibsAction(game);
    const err = validateAction(game, "mibs", action);
    assert.equal(err, null, err);
  });

  it("plays a full easy-mode game against a simple human policy", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsDifficulty: "easy",
      seed: 2023,
    });
    playToEnd(game);
  });

  it("plays a full hard-mode game against a simple human policy", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsDifficulty: "hard",
      seed: 808,
    });
    playToEnd(game);
  });

  it("seats several automas in a solo game and uses the 5-player board", () => {
    const game = createGame({
      players: [{ id: "p1", name: "Jung-hyeon" }],
      mibsCount: 4,
      mibsDifficulty: "hard",
      seed: 11,
    });
    assert.equal(game.players.length, 5);
    assert.equal(game.players.filter((p) => p.isMibs).length, 4);
    assert.deepEqual(
      game.players.map((p) => p.id),
      ["mibs", "mibs-2", "mibs-3", "mibs-4", "p1"]
    );
    assert.equal(game.players[4].bonusTile, 5);
    assert.equal(game.spec.fivePlayer, true);
    assert.equal(game.spec.purchaseTrackSize, 6);
  });

  it("honours a string automa count from the lobby payload", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsCount: "3",
      seed: 5,
    });
    assert.equal(game.mibsCount, 3);
    assert.equal(game.players.filter((p) => p.isMibs).length, 3);
  });

  it("lets each automa act from its own ledger", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsCount: 2,
      seed: 77,
    });
    const first = decideMibsAction(game);
    const r1 = applyAction(game, "mibs", first);
    assert.equal(r1.ok, true, r1.error);
    assert.equal(game.players[game.turnIndex].id, "mibs-2");
    const second = decideMibsAction(game);
    const err = validateAction(game, "mibs-2", second);
    assert.equal(err, null, err);
  });

  it("plays a full game against four easy automas", () => {
    const game = createGame({
      players: [{ id: "p1", name: "P1" }],
      mibsCount: 4,
      mibsDifficulty: "easy",
      seed: 4242,
    });
    playToEnd(game);
  });
});

function playToEnd(game) {
  let guard = 0;
  while (game.status === "playing" && guard < 2000) {
    guard += 1;
    const actor = game.players[game.turnIndex];
    const action = actor.isMibs ? decideMibsAction(game) : simpleHuman(game, actor);
    const result = applyAction(game, actor.id, action);
    assert.equal(
      result.ok,
      true,
      `${actor.name} ${JSON.stringify(action)} => ${result.error}`
    );
  }
  assert.equal(game.status, "ended");
  assert.ok(game.scores.length >= 2);
  assert.ok(game.winnerIds.length >= 1);
}

function simpleHuman(state, player) {
  const color = COLORS.find((c) => state.market[c] > 0) || "purple";
  if (player.cash >= goldPrice(state) && state.level >= 2) {
    return { type: "buyGold", count: 1, trackColor: color };
  }
  const held = COLORS.find((c) => player.shares[c] > 0);
  if (held && player.cash < 30) {
    const track = state.saleTracks[state.currentSaleTrack];
    const preferred = COLORS.find((c) => player.shares[c] > 0 && track.colored[c] > 0);
    const saleColor = preferred || COLORS.find((c) => track.colored[c] > 0) || held;
    return {
      type: "sellShares",
      sells: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0, [held]: 1 },
      trackColor: saleColor,
    };
  }
  const buyColor = COLORS.find((c) => state.market[c] > 0 && player.cash >= sharePrice(state, c));
  if (buyColor) {
    return {
      type: "buyShares",
      buys: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0, [buyColor]: 1 },
      trackColor: buyColor,
    };
  }
  return { type: "buyGold", count: 0, trackColor: color };
}
