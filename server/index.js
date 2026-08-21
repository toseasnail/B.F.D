import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { applyAction, createGame, publicView, skipTurn } from "../src/game/engine.js";
import { DESK_VERSION, parseSoloPayload } from "../src/game/constants.js";
import { decideLegalMibsAction, guaranteedAction } from "../src/game/mibs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(
  express.static(path.join(__dirname, "../public"), {
    etag: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js") || filePath.endsWith(".css") || filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

/** @type {Map<string, { name: string, tableId: string | null, playerId: string }>} */
const sockets = new Map();
/** @type {Map<string, Table>} */
const tables = new Map();

function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function uniqueCode() {
  let c = code();
  while ([...tables.values()].some((t) => t.code === c)) c = code();
  return c;
}

function normalizePlayerId(raw, fallback) {
  const id = String(raw || "")
    .trim()
    .slice(0, 64);
  if (/^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
  return `anon_${fallback}`;
}

function playerIdOf(socket) {
  return normalizePlayerId(socket.handshake.auth?.playerId, socket.id);
}

function infoOf(socket) {
  return sockets.get(socket.id);
}

function socketsForPlayer(playerId) {
  const ids = [];
  for (const [sid, info] of sockets) {
    if (info.playerId === playerId) ids.push(sid);
  }
  return ids;
}

function emitToPlayer(playerId, event, payload) {
  for (const sid of socketsForPlayer(playerId)) {
    io.to(sid).emit(event, payload);
  }
}

function tableForPlayer(playerId) {
  return [...tables.values()].find((t) => t.seats.some((s) => s.id === playerId)) || null;
}

function deskBuild() {
  return {
    version: DESK_VERSION,
    git: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
  };
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function lobbyPayload() {
  return {
    ...deskBuild(),
    tables: [...tables.values()]
      .filter((t) => t.status === "waiting")
      .map((t) => ({
        id: t.id,
        code: t.code,
        hostName: t.seats[0]?.name || "Host",
        seats: t.seats.map((s) => s.name),
        maxPlayers: t.maxPlayers,
        includeMibs: t.includeMibs,
        mibsDifficulty: t.mibsDifficulty,
      })),
  };
}

function broadcastLobby() {
  io.emit("lobby", lobbyPayload());
}

function emitGame(table) {
  if (!table.game) return;
  for (const seat of table.seats) {
    emitToPlayer(seat.id, "game", {
      tableId: table.id,
      code: table.code,
      view: publicView(table.game, seat.id),
    });
  }
}

function playMibsIfNeeded(table) {
  const game = table.game;
  if (!game || game.status !== "playing") return;
  const actor = game.players[game.turnIndex];
  if (!actor?.isMibs) return;
  if (table.mibsTimer) clearTimeout(table.mibsTimer);
  table.mibsTimer = setTimeout(() => {
    table.mibsTimer = null;
    if (!table.game || table.game.status !== "playing") return;
    const current = table.game.players[table.game.turnIndex];
    if (!current?.isMibs) return;
    let action = decideLegalMibsAction(table.game, current.id);
    let result = applyAction(table.game, current.id, action);
    if (!result.ok) {
      action = guaranteedAction(table.game);
      result = applyAction(table.game, current.id, action);
    }
    if (!result.ok) {
      console.warn("MIBS illegal action; skipping turn", result.error, action);
      skipTurn(table.game);
    }
    emitGame(table);
    playMibsIfNeeded(table);
  }, 220);
}

function makeHumanSeat(socket, name) {
  const info = infoOf(socket);
  return { id: info.playerId, socketId: socket.id, name };
}

function startSolo(socket, payload, extraCount) {
  const info = infoOf(socket);
  if (!info) return null;
  if (payload && typeof payload === "object" && payload.name) {
    info.name = String(payload.name).trim().slice(0, 24) || info.name;
  }
  abandonTable(socket);
  const { difficulty, mibsCount: automas } = parseSoloPayload(payload, extraCount);
  const table = {
    id: `t_${info.playerId}_${Date.now().toString(36)}`,
    code: uniqueCode(),
    status: "playing",
    maxPlayers: 1,
    includeMibs: true,
    mibsCount: automas,
    mibsDifficulty: difficulty,
    seats: [makeHumanSeat(socket, info.name)],
    game: null,
    mibsTimer: null,
  };
  table.game = createGame({
    players: table.seats,
    includeMibs: true,
    mibsCount: automas,
    mibsDifficulty: difficulty,
    difficulty,
  });
  tables.set(table.id, table);
  info.tableId = table.id;
  emitGame(table);
  playMibsIfNeeded(table);
  return table;
}

function abandonTable(socket) {
  const info = infoOf(socket);
  if (!info) return;
  if (!info.tableId) {
    const leftover = tableForPlayer(info.playerId);
    if (leftover) info.tableId = leftover.id;
  }
  if (!info.tableId) return;
  const table = tables.get(info.tableId);
  const playerId = info.playerId;
  info.tableId = null;
  for (const other of sockets.values()) {
    if (other.playerId === playerId) other.tableId = null;
  }
  if (!table) return;
  if (table.mibsTimer) {
    clearTimeout(table.mibsTimer);
    table.mibsTimer = null;
  }
  table.seats = table.seats.filter((s) => s.id !== playerId);
  if (table.game) {
    const player = table.game.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    emitGame(table);
  }
  if (table.seats.length === 0) tables.delete(table.id);
  else if (table.status === "waiting") {
    for (const seat of table.seats) emitToPlayer(seat.id, "waiting", waitingView(table));
  }
  broadcastLobby();
}

function parkOnDisconnect(socket) {
  const info = infoOf(socket);
  if (!info?.tableId) return;
  const table = tables.get(info.tableId);
  if (!table) {
    info.tableId = null;
    return;
  }
  for (const [sid, other] of sockets) {
    if (sid !== socket.id && other.playerId === info.playerId && other.tableId === table.id) {
      return;
    }
  }
  if (table.status === "waiting") {
    abandonTable(socket);
    return;
  }
  const seat = table.seats.find((s) => s.id === info.playerId);
  if (seat) seat.socketId = null;
  if (table.game) {
    const player = table.game.players.find((p) => p.id === info.playerId);
    if (player) player.connected = false;
    emitGame(table);
  }
}

function resumeSeat(socket) {
  const info = infoOf(socket);
  if (!info) return;
  const table = tableForPlayer(info.playerId);
  if (!table) return;
  const seat = table.seats.find((s) => s.id === info.playerId);
  seat.socketId = socket.id;
  if (info.name && info.name !== "Trader") seat.name = info.name;
  else info.name = seat.name;
  info.tableId = table.id;
  if (table.game) {
    const player = table.game.players.find((p) => p.id === info.playerId);
    if (player) {
      player.connected = true;
      player.name = seat.name;
    }
    emitGame(table);
    playMibsIfNeeded(table);
  } else if (table.status === "waiting") {
    socket.emit("waiting", waitingView(table));
  }
}

io.on("connection", (socket) => {
  const playerId = playerIdOf(socket);
  sockets.set(socket.id, { name: "Trader", tableId: null, playerId });
  resumeSeat(socket);
  socket.emit("hello", { id: playerId, socketId: socket.id });
  socket.emit("lobby", lobbyPayload());

  socket.on("setName", (name) => {
    const info = infoOf(socket);
    info.name = String(name || "Trader").trim().slice(0, 24) || "Trader";
    const table = tables.get(info.tableId);
    if (table) {
      const seat = table.seats.find((s) => s.id === info.playerId);
      if (seat) seat.name = info.name;
      const player = table.game?.players.find((p) => p.id === info.playerId);
      if (player) player.name = info.name;
    }
    socket.emit("you", { id: info.playerId, name: info.name });
  });

  socket.on("resume", () => {
    resumeSeat(socket);
  });

  socket.on("solo", (a, b) => {
    startSolo(socket, a, b);
  });

  socket.on("wait", ({ maxPlayers = 2, includeMibs = false, mibsDifficulty = "hard" } = {}) => {
    const info = infoOf(socket);
    abandonTable(socket);
    const cap = Math.min(5, Math.max(2, Number(maxPlayers) || 2));
    const wantMibs = Boolean(includeMibs);
    const difficulty = mibsDifficulty === "easy" ? "easy" : "hard";

    const existing = [...tables.values()].find(
      (t) =>
        t.status === "waiting" &&
        t.maxPlayers === cap &&
        t.includeMibs === wantMibs &&
        t.mibsDifficulty === difficulty &&
        t.seats.length < cap
    );
    if (existing) {
      if (!existing.seats.some((s) => s.id === info.playerId)) {
        existing.seats.push(makeHumanSeat(socket, info.name));
      }
      info.tableId = existing.id;
      maybeStart(existing);
      broadcastLobby();
      if (existing.status === "waiting") {
        for (const seat of existing.seats) emitToPlayer(seat.id, "waiting", waitingView(existing));
      }
      return;
    }

    const table = {
      id: `t_${info.playerId}_${Date.now().toString(36)}`,
      code: uniqueCode(),
      status: "waiting",
      maxPlayers: cap,
      includeMibs: wantMibs,
      mibsDifficulty: difficulty,
      seats: [makeHumanSeat(socket, info.name)],
      game: null,
      mibsTimer: null,
    };
    tables.set(table.id, table);
    info.tableId = table.id;
    socket.emit("waiting", waitingView(table));
    broadcastLobby();
  });

  socket.on("joinTable", ({ tableId, code: joinCode } = {}) => {
    const info = infoOf(socket);
    const table = tableId
      ? tables.get(tableId)
      : [...tables.values()].find((t) => t.code === String(joinCode || "").toUpperCase());
    if (!table || table.status !== "waiting") {
      socket.emit("errorMessage", "That table is not waiting for players.");
      return;
    }
    if (table.seats.some((s) => s.id === info.playerId)) {
      const seat = table.seats.find((s) => s.id === info.playerId);
      seat.socketId = socket.id;
      info.tableId = table.id;
      socket.emit("waiting", waitingView(table));
      return;
    }
    if (table.seats.length >= table.maxPlayers) {
      socket.emit("errorMessage", "That table is full.");
      return;
    }
    abandonTable(socket);
    table.seats.push(makeHumanSeat(socket, info.name));
    info.tableId = table.id;
    maybeStart(table);
    broadcastLobby();
    if (table.status === "waiting") {
      for (const seat of table.seats) emitToPlayer(seat.id, "waiting", waitingView(table));
    }
  });

  socket.on("cancelWait", () => {
    abandonTable(socket);
    socket.emit("lobby", lobbyPayload());
  });

  socket.on("action", (action) => {
    const info = infoOf(socket);
    if (!info) {
      socket.emit("errorMessage", "Reconnect and stamp again.");
      return;
    }
    if (!info.tableId) resumeSeat(socket);
    const table = tables.get(info.tableId);
    if (!table?.game) {
      socket.emit("errorMessage", "The desk is not open. Refresh or start a new solo game.");
      return;
    }
    const result = applyAction(table.game, info.playerId, action);
    if (!result.ok) {
      socket.emit("errorMessage", result.error);
      return;
    }
    emitGame(table);
    playMibsIfNeeded(table);
  });

  socket.on("disconnect", () => {
    parkOnDisconnect(socket);
    sockets.delete(socket.id);
  });
});

app.get("/api/health", (_req, res) => {
  noStore(res);
  res.json({ ok: true, solo: true, ...deskBuild() });
});

app.post("/api/solo", (req, res) => {
  const socketId = String(req.body?.socketId || "");
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    res.status(400).json({ error: "Connect first, then start a solo desk." });
    return;
  }
  const table = startSolo(socket, req.body);
  if (!table?.game) {
    res.status(500).json({ error: "Could not open a solo desk." });
    return;
  }
  const playerId = playerIdOf(socket);
  res.json({
    ok: true,
    tableId: table.id,
    mibsCount: table.game.mibsCount,
    players: table.game.players.map((p) => ({ id: p.id, name: p.name, isMibs: p.isMibs })),
    view: publicView(table.game, playerId),
  });
});

app.get("*", (_req, res) => {
  noStore(res);
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

function waitingView(table) {
  return {
    tableId: table.id,
    code: table.code,
    seats: table.seats.map((s) => s.name),
    maxPlayers: table.maxPlayers,
    includeMibs: table.includeMibs,
    mibsDifficulty: table.mibsDifficulty,
  };
}

function maybeStart(table) {
  if (table.status !== "waiting") return;
  if (table.seats.length < table.maxPlayers) {
    for (const seat of table.seats) emitToPlayer(seat.id, "waiting", waitingView(table));
    return;
  }
  table.status = "playing";
  table.game = createGame({
    players: table.seats.map((s) => ({ id: s.id, name: s.name })),
    includeMibs: table.includeMibs,
    mibsDifficulty: table.mibsDifficulty,
  });
  emitGame(table);
  playMibsIfNeeded(table);
}

export { app, server, io };

if (process.env.BFD_NO_LISTEN !== "1") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Black Friday Desk listening on http://localhost:${PORT}`);
  });
}
