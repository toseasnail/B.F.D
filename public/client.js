const COLORS = ["purple", "yellow", "green", "blue", "white"];
const COLOR_HEX = {
  purple: "#9b3db5",
  yellow: "#e2b100",
  green: "#2f9e44",
  blue: "#1c7ed6",
  white: "#f7f4ea",
};
const PRICE_TABLE = [
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
const GOLD_TRACK = [
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
  80, 85, 90, 95, 100,
];
const LEVELS = [
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
/** Token cell → price-level area 0–9. Diagonal chevrons; 1f = bottom. */
const LEVEL_CELLS = [
  [0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 2, 2, 2],
  [1, 2, 2, 2, 2, 1, 1],
  [2, 2, 1, 1, 1, 1, 3],
  [1, 1, 1, 3, 3, 3, 3],
  [3, 3, 3, 3, 4, 4, 4],
  [3, 4, 4, 4, 4, 5, 5],
  [4, 4, 5, 5, 5, 5, 6],
  [5, 5, 5, 5, 6, 6, 6],
  [5, 5, 5, 5, 6, 6, 6],
  [5, 6, 6, 6, 6, 7, 7],
  [6, 6, 7, 7, 8, 8, 9],
  [8, 8, 8, 9, 9, 9, 9],
];
const CELL_SHADE = LEVEL_CELLS.map((row) =>
  row.map((level) => (level === 0 || level % 2 === 1 ? "C" : "G")).join("")
);

function levelForCell(row, col) {
  return LEVEL_CELLS[row]?.[col] ?? 0;
}

function goldIsMajor(n) {
  return n === 20 || n === 100 || n % 5 === 0;
}

let prevLevel = null;

const socket = io();
const state = {
  id: null,
  name: localStorage.getItem("bfd-name") || "",
  soloMibsCount: clampMibsCount(localStorage.getItem("bfd-mibs-count")),
  screen: "lobby",
  lobby: { tables: [] },
  waiting: null,
  view: null,
  error: "",
  draft: emptyDraft(),
};

function clampMibsCount(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(1, n));
}

function emptyDraft() {
  return {
    type: "buyShares",
    buys: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 },
    sells: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 },
    count: 0,
    trackColor: "purple",
    bonus: "",
    manipulateTarget: "purchase",
    manipulateColor: "purple",
  };
}

function emptyCounts() {
  return { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 };
}

socket.on("hello", ({ id }) => {
  state.id = id;
  if (state.name) socket.emit("setName", state.name);
  render();
});
socket.on("you", ({ name }) => {
  state.name = name;
  render();
});
socket.on("lobby", (lobby) => {
  state.lobby = lobby;
  if (state.screen === "game" && state.view) return;
  if (state.screen !== "waiting") state.screen = "lobby";
  render();
});
socket.on("waiting", (waiting) => {
  state.screen = "waiting";
  state.waiting = waiting;
  render();
});
socket.on("game", ({ view }) => {
  state.screen = "game";
  state.view = view;
  if (view.status === "ended") state.screen = "ended";
  render();
});
socket.on("errorMessage", (message) => {
  state.error = message;
  render();
});

function $(sel, root = document) {
  return root.querySelector(sel);
}

function render() {
  const app = document.getElementById("app");
  if (state.screen === "game" || state.screen === "ended") app.innerHTML = renderGame();
  else if (state.screen === "waiting") app.innerHTML = renderWaiting();
  else app.innerHTML = renderLobby();
  bind();
}

function renderLobby() {
  const tables = state.lobby.tables || [];
  return `
  <div class="wrap">
    <header class="masthead">
      <div>
        <small>B.F.D.</small>
        <h1>Black Friday Desk</h1>
      </div>
      <div class="tick">GOLD 20 ↗  CRASH AT 100</div>
    </header>
    ${state.error ? `<div class="banner">${esc(state.error)}</div>` : ""}
    <div class="lobby-grid">
      <section class="panel stack">
        <h2>Take a seat</h2>
        <p class="muted">Speculate in shares, dump before the crash, and pile up gold. Play the official M.I.B.S. automa or match traders on other computers.</p>
        <label>Your name<br><input id="name" value="${esc(state.name)}" placeholder="Jung-hyeon" maxlength="24"></label>
        <div>
          <div class="muted" style="margin-bottom:6px">Solo automas</div>
          <div class="row">
            ${[1, 2, 3, 4]
              .map(
                (n) =>
                  `<button type="button" class="btn ${state.soloMibsCount === n ? "gold" : ""}" data-act="mibsCount" data-n="${n}">${n}</button>`
              )
              .join("")}
            <span class="muted">M.I.B.S. chairs</span>
          </div>
        </div>
        <p class="muted">One human plus up to four automas (five chairs max). They sit first and take consecutive turns.</p>
        <div class="row">
          <button class="btn gold" data-act="solo" data-diff="easy" data-mibs="${state.soloMibsCount}">Play vs ${state.soloMibsCount} Easy M.I.B.S.</button>
          <button class="btn" data-act="solo" data-diff="hard" data-mibs="${state.soloMibsCount}">Play vs ${state.soloMibsCount} Hard M.I.B.S.</button>
        </div>
        <hr>
        <h3 class="serif">Waiting for players</h3>
        <p class="muted">Click the button and anyone else who waits with the same settings is matched to you. Two-trader tables also seat M.I.B.S. as the third chair, per the 2023 rules.</p>
        <div class="row">
          <label>Seats
            <select id="maxPlayers">
              <option value="2">2 humans</option>
              <option value="3">3 humans</option>
              <option value="4">4 humans</option>
              <option value="5">5 humans</option>
            </select>
          </label>
          <label>M.I.B.S.
            <select id="mibs">
              <option value="off">Off (3–5 humans)</option>
              <option value="easy">Easy</option>
              <option value="hard" selected>Hard</option>
            </select>
          </label>
        </div>
        <div class="row">
          <button class="btn gold" data-act="wait">Waiting for players</button>
          <input id="joinCode" placeholder="Room code" maxlength="6" style="width:120px">
          <button class="btn ink-ghost" data-act="joinCode">Join code</button>
        </div>
      </section>
      <section class="panel stack">
        <h2>Open desks</h2>
        <div class="table-list">
          ${
            tables.length
              ? tables
                  .map(
                    (t) => `
            <div class="table-card">
              <div>
                <strong>${esc(t.code)}</strong> · ${esc(t.hostName)}<br>
                <span class="muted">${t.seats.length}/${t.maxPlayers} seated${t.includeMibs ? " + M.I.B.S. " + t.mibsDifficulty : ""}</span>
              </div>
              <button class="btn" data-act="join" data-id="${t.id}">Sit down</button>
            </div>`
                  )
                  .join("")
              : `<p class="muted">No one is waiting. Start a desk and keep this tab open.</p>`
          }
        </div>
        <p class="muted">Goal: most dollars after gold hits $100. Small gold bars are $100, big bars $500. Other humans cannot see your cash, shares, or gold until the floor closes.</p>
      </section>
    </div>
  </div>`;
}

function renderWaiting() {
  const w = state.waiting;
  return `
  <div class="wrap">
    <header class="masthead">
      <div><small>B.F.D.</small><h1>Waiting for players</h1></div>
      <div class="tick">ROOM ${esc(w.code)}</div>
    </header>
    <section class="panel stack">
      <p>Share code <strong>${esc(w.code)}</strong> or wait — anyone who clicks “Waiting for players” with the same seat count is matched here.</p>
      <p>${w.seats.map(esc).join(", ")} · ${w.seats.length}/${w.maxPlayers}</p>
      <button class="btn warn" data-act="cancel">Leave desk</button>
    </section>
  </div>`;
}

function renderGame() {
  const v = state.view;
  const me = v.players.find((p) => p.id === v.you);
  const current = v.players.find((p) => p.id === v.currentPlayerId);
  const yourTurn = v.currentPlayerId === v.you && v.status === "playing";
  const leveledUp = prevLevel !== null && v.level !== prevLevel;
  prevLevel = v.level;
  return `
  <div class="wrap play">
    <header class="masthead compact">
      <div>
        <small>B.F.D.</small>
        <h1>Black Friday</h1>
      </div>
      <div class="tick">${yourTurn ? "YOUR TICKET" : `${esc(current?.name || "…")} IS TRADING`} · bag ${v.bagCount}${
        v.mibsCount > 1 ? ` · ${v.mibsCount}× M.I.B.S.` : ""
      }</div>
    </header>
    ${state.error ? `<div class="banner">${esc(state.error)}</div>` : ""}
    <div class="felt ${leveledUp ? "level-changed" : ""}">
      <div class="west">
        ${renderGoldTrack(v)}
        ${renderPriceGrid(v)}
      </div>
      <div class="east">
        ${renderLevelCard(v, leveledUp)}
        ${renderMarket(v)}
        ${renderTracks(v)}
        ${renderPurchasedGold(v)}
      </div>
    </div>
    <div class="players-row">
      ${v.players
        .map(
          (p) => `
        <div class="player-card ${p.id === v.you ? "you" : ""} ${p.id === v.currentPlayerId ? "active" : ""}">
          <div>
            <strong>${esc(p.name)}</strong>
            ${p.isMibs ? "<div class='muted'>Automa</div>" : ""}
            ${p.bonusTile && !p.bonusUsed ? `<div class='muted'>Bonus ${p.bonusTile}</div>` : ""}
          </div>
          <div class="tick">
            ${p.hidden ? "HIDDEN" : `$${p.cash} · ${p.shareTotal} sh · ${p.goldBars} Au`}
          </div>
        </div>`
        )
        .join("")}
    </div>
    <div class="lower">
      ${renderHand(me, v)}
      ${renderActions(v, me, yourTurn)}
      <aside class="log">
        <h3 class="serif">Tape</h3>
        ${(v.log || [])
          .slice(-18)
          .reverse()
          .map((l) => `<div>${esc(l.text)}</div>`)
          .join("")}
      </aside>
    </div>
  </div>
  ${v.status === "ended" ? renderOverlay(v) : ""}`;
}

function renderGoldTrack(v) {
  return `<div class="gold-rail" title="Gold price">
    <div class="gold-now">$${v.goldPrice}${v.goldPrice >= 100 ? " ★" : ""}</div>
    <div class="gold-beads">
      ${GOLD_TRACK.map((n, i) => {
        const on = i === v.goldIndex;
        const major = goldIsMajor(n);
        return `<div class="bead ${on ? "on" : ""} ${major ? "major" : ""}" title="$${n}">
          ${major || on ? `<span class="bead-lbl">${n}</span>` : ""}
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderPriceGrid(v) {
  const tokens = {};
  for (const c of COLORS) {
    const p = v.pricesDisplay[c];
    const key = `${p.row}-${p.col}`;
    tokens[key] ??= [];
    tokens[key].push(c);
  }
  const blacks = v.levelBlacks || [];
  const anchors = [];
  for (let level = 0; level < 10; level++) {
    scan: for (let r = 0; r < PRICE_TABLE.length; r++) {
      for (let c = 6; c >= 0; c--) {
        if (LEVEL_CELLS[r][c] === level) {
          anchors[level] = { r, c };
          break scan;
        }
      }
    }
  }
  const cells = [];
  for (let r = PRICE_TABLE.length - 1; r >= 0; r--) {
    const cssRow = 13 - r;
    const leftWrap = r % 2 === 1 && r < 12;
    const rightWrap = r % 2 === 0 && r < 12;
    cells.push(`<div class="gutter left ${leftWrap ? "wrap-up" : ""}" style="grid-row:${cssRow};grid-column:1">${
      leftWrap ? "<span class='wrap-arrow'>↖</span>" : ""
    }</div>`);
    for (let c = 0; c < 7; c++) {
      const band = levelForCell(r, c);
      const shade = CELL_SHADE[r][c] === "G" ? "g" : "c";
      const key = `${r}-${c}`;
      const anchored = anchors.findIndex((a) => a && a.r === r && a.c === c);
      const info = anchored >= 0 ? LEVELS[anchored] : null;
      const passed = anchored >= 0 && anchored < v.level;
      const isCurrent = anchored === v.level;
      const hasBlack = anchored > 0 && blacks[anchored - 1] !== false;
      cells.push(`<div class="cell shade-${shade} ${band === v.level ? "current-band" : ""} ${band < v.level ? "cleared-band" : ""}"
        style="grid-row:${cssRow};grid-column:${c + 2}"
        title="$${PRICE_TABLE[r][c]} · level ${band}">
        <span class="pv">${PRICE_TABLE[r][c]}</span>
        ${
          anchored >= 0
            ? `<span class="lv-tag on-cell ${isCurrent ? "is-now" : ""} ${passed ? "is-passed" : ""}" title="Level ${anchored}: buy/sell ${info.shareLimit}, gold ${info.goldLimit}, draw ${info.drawCount}">
                <span class="lv-num">${anchored}</span>
                ${hasBlack && !passed ? `<span class="lv-case"></span>` : ""}
              </span>`
            : ""
        }
        <div class="tokens">${(tokens[key] || [])
          .map((col) => `<span class="dot" style="background:${COLOR_HEX[col]}" title="${col} $${v.pricesDisplay[col].price}"></span>`)
          .join("")}</div>
      </div>`);
    }
    cells.push(`<div class="gutter right ${rightWrap ? "wrap-up" : ""}" style="grid-row:${cssRow};grid-column:9">
      ${rightWrap ? "<span class='wrap-arrow'>↗</span>" : ""}
    </div>`);
  }
  return `<div class="ledger">
    <div class="ledger-head"><span>Share price table</span><span>zigzag levels 0–9</span></div>
    <div class="ledger-grid">${cells.join("")}</div>
  </div>`;
}

function renderLevelCard(v, leveledUp) {
  const info = v.levelInfo;
  return `<div class="level-card ${leveledUp ? "pop" : ""}">
    <div class="level-card-tab">${v.level}</div>
    <div class="level-card-body">
      <div class="level-card-now">Now in effect</div>
      <div><i>I</i> <b>${info.shareLimit}</b> buy / sell</div>
      <div><i>II</i> <b>${info.goldLimit}</b> gold</div>
      <div><i>III</i> draw <b>${info.drawCount}</b></div>
    </div>
  </div>`;
}

function renderMarket(v) {
  return `<div class="market-cols">
    ${COLORS.map((c) => {
      const n = v.market[c];
      const shown = Math.min(n, 9);
      return `<div class="mcol" style="--c:${COLOR_HEX[c]}">
        <div class="mstack">${Array.from({ length: shown }, () => `<span class="chip" style="background:${COLOR_HEX[c]}"></span>`).join("")}</div>
        <div class="mcount">${n}</div>
      </div>`;
    }).join("")}
  </div>`;
}

function renderTracks(v) {
  const chip = (c) => `<span class="chip" style="background:${c === "black" ? "#111" : COLOR_HEX[c]}"></span>`;
  const slots = (arr, size) => {
    const cells = [];
    for (let i = 0; i < size; i++) {
      cells.push(arr[i] ? chip(arr[i]) : `<span class="slot"></span>`);
    }
    return `<div class="slot-row">${cells.join("")}</div>`;
  };
  const buySize = v.spec?.purchaseTrackSize || 5;
  const goldSize = v.spec?.goldTrackSize || 5;
  const sale = v.saleTracks
    .map((t, i) => {
      const chips = [];
      for (let n = 0; n < t.black; n++) chips.push(chip("black"));
      for (const c of COLORS) for (let n = 0; n < t.colored[c]; n++) chips.push(chip(c));
      return `<div class="sale-row ${i === v.currentSaleTrack ? "current-sale" : ""}">
        <span class="sale-lbl">${i + 1}</span>
        <div class="chips">${chips.join("") || "<span class='muted'>—</span>"}</div>
      </div>`;
    })
    .join("");
  return `<div class="board-tracks">
    <div class="sale-block"><span class="east-lbl">Share sale</span>${sale}</div>
    <div><span class="east-lbl">Share purchase</span>${slots(v.purchaseTrack, buySize)}</div>
    <div><span class="east-lbl">Gold purchase</span>${slots(v.goldPurchaseTrack, goldSize)}</div>
  </div>`;
}

function renderPurchasedGold(v) {
  const max = 15;
  const pos = Math.min(max, v.purchasedGold);
  const beads = [];
  for (let i = 0; i <= max; i++) {
    beads.push(`<div class="pg ${i === pos ? "on" : ""}">${i}</div>`);
  }
  return `<div class="purchased-gold"><span class="east-lbl">Gold bars since last price change</span><div class="pg-row">${beads.join("")}</div></div>`;
}

function renderHand(me, v) {
  if (!me || me.hidden) return `<section class="hand"><h3 class="serif">Holdings</h3><p class="muted">Waiting for your seat.</p></section>`;
  return `<section class="hand">
    <h3 class="serif">Your ledger</h3>
    <p><strong>$${me.cash}</strong> cash · ${me.goldBars} gold bars</p>
    <div class="stack">
      ${COLORS.map(
        (c) => `<div class="row">
          <span class="briefcase" style="background:${COLOR_HEX[c]}"></span>
          <span>${c}</span>
          <span class="qty">${me.shares[c]} × $${v.pricesDisplay[c].price}</span>
        </div>`
      ).join("")}
    </div>
  </section>`;
}

function renderActions(v, me, yourTurn) {
  const d = state.draft;
  const limit = v.levelInfo.shareLimit + (d.bonus === "extraBuy" || d.bonus === "extraSell" ? 1 : 0);
  const gLimit = v.levelInfo.goldLimit + (d.bonus === "extraGold" ? 1 : 0);
  const powers = v.yourPowers || [];
  return `<section class="actions">
    <h3 class="serif">Ticket</h3>
    ${yourTurn ? `<p class="muted">Pick one action. Zero is legal — it still moves a share onto a track. Click a color to add, right-click to remove.</p>` : `<p class="muted">Wait for your turn.</p>`}
    <div class="row">
      ${["buyShares", "sellShares", "buyGold"]
        .map(
          (t) => `<button class="btn ${d.type === t ? "gold" : "ghost"}" data-act="type" data-type="${t}" ${yourTurn ? "" : "disabled"}>
            ${t === "buyShares" ? "Buy shares" : t === "sellShares" ? "Sell shares" : "Buy gold"}
          </button>`
        )
        .join("")}
    </div>
    ${
      d.type !== "buyGold"
        ? COLORS.map((c) => {
            const field = d.type === "buyShares" ? "buys" : "sells";
            return `<button class="color-btn" style="background:${COLOR_HEX[c]}" data-act="inc" data-color="${c}" ${yourTurn ? "" : "disabled"}>
              ${c} $${v.pricesDisplay[c].price} · mkt ${v.market[c]}
              <span class="qty">${d[field][c]}</span>
            </button>`;
          }).join("")
        : `<div class="row"><button class="btn ghost" data-act="goldMinus" ${yourTurn ? "" : "disabled"}>-</button>
           <span class="qty">${d.count} / ${gLimit}</span>
           <button class="btn ghost" data-act="goldPlus" ${yourTurn ? "" : "disabled"}>+</button>
           <span>at $${v.goldPrice}</span></div>`
    }
    <label>Track color
      <select id="trackColor">${COLORS.map((c) => `<option ${d.trackColor === c ? "selected" : ""}>${c}</option>`).join("")}</select>
    </label>
    ${
      powers.length
        ? `<label>Bonus (once)
            <select id="bonus">
              <option value="">No bonus</option>
              ${powers.map((p) => `<option value="${p}" ${d.bonus === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </label>`
        : ""
    }
    ${
      d.bonus === "manipulate"
        ? `<div class="row">
            <select id="manipTarget">
              <option value="purchase" ${d.manipulateTarget === "purchase" ? "selected" : ""}>purchase track</option>
              <option value="gold" ${d.manipulateTarget === "gold" ? "selected" : ""}>gold track</option>
              <option value="sale" ${d.manipulateTarget === "sale" ? "selected" : ""}>sale track</option>
            </select>
            <select id="manipColor">${COLORS.map((c) => `<option ${d.manipulateColor === c ? "selected" : ""}>${c}</option>`).join("")}</select>
          </div>`
        : ""
    }
    <button class="btn gold" data-act="submit" ${yourTurn ? "" : "disabled"}>Stamp ticket</button>
    <p class="muted">Limit this turn: ${limit} shares · ${gLimit} gold</p>
  </section>`;
}

function renderOverlay(v) {
  return `<div class="overlay"><section class="panel">
    <h2>The floor is closed</h2>
    <table class="score">
      <tr><th>Trader</th><th>Cash</th><th>Gold</th><th>Total</th></tr>
      ${v.scores
        .map(
          (s) => `<tr>
            <td>${esc(s.name)}${v.winnerIds.includes(s.id) ? " ★" : ""}</td>
            <td>$${s.cash}</td>
            <td>${s.goldBars}</td>
            <td><strong>$${s.total}</strong></td>
          </tr>`
        )
        .join("")}
    </table>
    <div class="row" style="margin-top:16px">
      <button class="btn gold" data-act="lobby">Back to lobby</button>
    </div>
  </section></div>`;
}

function bind() {
  document.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", onAct);
    if (el.dataset.act === "inc") el.addEventListener("contextmenu", onAct);
  });
  const name = $("#name");
  if (name) {
    name.addEventListener("change", () => {
      state.name = name.value.trim();
      localStorage.setItem("bfd-name", state.name);
      socket.emit("setName", state.name);
    });
  }
  const track = $("#trackColor");
  if (track) track.addEventListener("change", () => (state.draft.trackColor = track.value));
  const bonus = $("#bonus");
  if (bonus)
    bonus.addEventListener("change", () => {
      state.draft.bonus = bonus.value;
      render();
    });
  const mt = $("#manipTarget");
  if (mt) mt.addEventListener("change", () => (state.draft.manipulateTarget = mt.value));
  const mc = $("#manipColor");
  if (mc) mc.addEventListener("change", () => (state.draft.manipulateColor = mc.value));
}

function onAct(e) {
  const act = e.currentTarget.dataset.act;
  const v = state.view;
  if (act === "mibsCount") {
    state.soloMibsCount = clampMibsCount(e.currentTarget.dataset.n);
    localStorage.setItem("bfd-mibs-count", String(state.soloMibsCount));
    render();
  } else if (act === "solo") {
    commitName();
    const n = clampMibsCount(e.currentTarget.dataset.mibs || state.soloMibsCount);
    state.soloMibsCount = n;
    localStorage.setItem("bfd-mibs-count", String(n));
    socket.emit("solo", e.currentTarget.dataset.diff, n);
  } else if (act === "wait") {
    commitName();
    const maxPlayers = Number($("#maxPlayers").value);
    const mibs = $("#mibs").value;
    socket.emit("wait", {
      maxPlayers,
      includeMibs: mibs !== "off",
      mibsDifficulty: mibs === "easy" ? "easy" : "hard",
    });
  } else if (act === "join") {
    commitName();
    socket.emit("joinTable", { tableId: e.currentTarget.dataset.id });
  } else if (act === "joinCode") {
    commitName();
    socket.emit("joinTable", { code: $("#joinCode").value.trim() });
  } else if (act === "cancel") {
    socket.emit("cancelWait");
    state.screen = "lobby";
    render();
  } else if (act === "lobby") {
    socket.emit("cancelWait");
    state.view = null;
    state.draft = emptyDraft();
    state.screen = "lobby";
    render();
  } else if (act === "type") {
    state.draft.type = e.currentTarget.dataset.type;
    state.draft.buys = emptyCounts();
    state.draft.sells = emptyCounts();
    state.draft.count = 0;
    render();
  } else if (act === "inc") {
    const color = e.currentTarget.dataset.color;
    const field = state.draft.type === "buyShares" ? "buys" : "sells";
    const extra = state.draft.bonus === "extraBuy" || state.draft.bonus === "extraSell" ? 1 : 0;
    const limit = (v?.levelInfo.shareLimit || 1) + extra;
    const total = COLORS.reduce((s, c) => s + state.draft[field][c], 0);
    if (e.type === "contextmenu" || e.shiftKey || (state.draft[field][color] > 0 && total >= limit)) {
      e.preventDefault();
      state.draft[field][color] = Math.max(0, state.draft[field][color] - 1);
    } else if (total < limit) {
      state.draft[field][color] += 1;
    }
    state.draft.trackColor = color;
    render();
  } else if (act === "goldPlus") {
    const extra = state.draft.bonus === "extraGold" ? 1 : 0;
    const limit = (v?.levelInfo.goldLimit || 1) + extra;
    state.draft.count = Math.min(limit, state.draft.count + 1);
    render();
  } else if (act === "goldMinus") {
    state.draft.count = Math.max(0, state.draft.count - 1);
    render();
  } else if (act === "submit") {
    submit();
  }
}

function commitName() {
  const el = $("#name");
  const name = (el ? el.value : state.name).trim() || "Trader";
  state.name = name;
  localStorage.setItem("bfd-name", name);
  socket.emit("setName", name);
}

function submit() {
  const d = state.draft;
  const action = {
    type: d.type,
    trackColor: d.trackColor,
  };
  if (d.bonus) {
    action.bonus = d.bonus;
    action.manipulateTarget = d.manipulateTarget;
    action.manipulateColor = d.manipulateColor;
  }
  if (d.type === "buyShares") action.buys = { ...d.buys };
  if (d.type === "sellShares") action.sells = { ...d.sells };
  if (d.type === "buyGold") action.count = d.count;
  state.error = "";
  socket.emit("action", action);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
