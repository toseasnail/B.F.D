import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { applyAction, createGame, publicView } from "../src/game/engine.js";
import { decideMibsAction } from "../src/game/mibs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(__dirname, "../public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

/** @type {Map<string, any>} */
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

function lobbyPayload() {
  return {
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
    io.to(seat.socketId).emit("game", {
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
  table.mibsTimer = setTimeout(() => {
    if (!table.game || table.game.status !== "playing") return;
    const current = table.game.players[table.game.turnIndex];
    if (!current?.isMibs) return;
    const action = decideMibsAction(table.game);
    const result = applyAction(table.game, "mibs", action);
    if (!result.ok) {
      console.warn("MIBS illegal action", result.error, action);
      return;
    }
    emitGame(table);
    playMibsIfNeeded(table);
  }, 750);
}

function leaveTable(socket) {
  const info = sockets.get(socket.id);
  if (!info?.tableId) return;
  const table = tables.get(info.tableId);
  info.tableId = null;
  if (!table) return;
  if (table.mibsTimer) clearTimeout(table.mibsTimer);
  table.seats = table.seats.filter((s) => s.socketId !== socket.id);
  if (table.game) {
    const player = table.game.players.find((p) => p.id === socket.id);
    if (player) player.connected = false;
    emitGame(table);
  }
  if (table.seats.length === 0) tables.delete(table.id);
  broadcastLobby();
}

io.on("connection", (socket) => {
  sockets.set(socket.id, { name: "Trader", tableId: null });
  socket.emit("hello", { id: socket.id });
  socket.emit("lobby", lobbyPayload());

  socket.on("setName", (name) => {
    const info = sockets.get(socket.id);
    info.name = String(name || "Trader").trim().slice(0, 24) || "Trader";
    socket.emit("you", { id: socket.id, name: info.name });
  });

  socket.on("solo", ({ difficulty } = {}) => {
    const info = sockets.get(socket.id);
    leaveTable(socket);
    const table = {
      id: `t_${socket.id}`,
      code: uniqueCode(),
      status: "playing",
      maxPlayers: 1,
      includeMibs: true,
      mibsDifficulty: difficulty === "easy" ? "easy" : "hard",
      seats: [{ id: socket.id, socketId: socket.id, name: info.name }],
      game: null,
      mibsTimer: null,
    };
    table.game = createGame({
      players: table.seats,
      includeMibs: true,
      mibsDifficulty: table.mibsDifficulty,
    });
    tables.set(table.id, table);
    info.tableId = table.id;
    emitGame(table);
    playMibsIfNeeded(table);
  });

  socket.on("wait", ({ maxPlayers = 2, includeMibs = false, mibsDifficulty = "hard" } = {}) => {
    const info = sockets.get(socket.id);
    leaveTable(socket);
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
      existing.seats.push({ id: socket.id, socketId: socket.id, name: info.name });
      info.tableId = existing.id;
      maybeStart(existing);
      broadcastLobby();
      if (existing.status === "waiting") {
        for (const seat of existing.seats) {
          io.to(seat.socketId).emit("waiting", waitingView(existing));
        }
      }
      return;
    }

    const table = {
      id: `t_${socket.id}`,
      code: uniqueCode(),
      status: "waiting",
      maxPlayers: cap,
      includeMibs: wantMibs,
      mibsDifficulty: difficulty,
      seats: [{ id: socket.id, socketId: socket.id, name: info.name }],
      game: null,
      mibsTimer: null,
    };
    tables.set(table.id, table);
    info.tableId = table.id;
    socket.emit("waiting", waitingView(table));
    broadcastLobby();
  });

  socket.on("joinTable", ({ tableId, code: joinCode } = {}) => {
    const info = sockets.get(socket.id);
    const table = tableId
      ? tables.get(tableId)
      : [...tables.values()].find((t) => t.code === String(joinCode || "").toUpperCase());
    if (!table || table.status !== "waiting") {
      socket.emit("errorMessage", "That table is not waiting for players.");
      return;
    }
    if (table.seats.some((s) => s.socketId === socket.id)) return;
    if (table.seats.length >= table.maxPlayers) {
      socket.emit("errorMessage", "That table is full.");
      return;
    }
    leaveTable(socket);
    table.seats.push({ id: socket.id, socketId: socket.id, name: info.name });
    info.tableId = table.id;
    maybeStart(table);
    broadcastLobby();
    if (table.status === "waiting") {
      for (const seat of table.seats) io.to(seat.socketId).emit("waiting", waitingView(table));
    }
  });

  socket.on("cancelWait", () => {
    leaveTable(socket);
    socket.emit("lobby", lobbyPayload());
  });

  socket.on("action", (action) => {
    const info = sockets.get(socket.id);
    const table = tables.get(info.tableId);
    if (!table?.game) return;
    const result = applyAction(table.game, socket.id, action);
    if (!result.ok) {
      socket.emit("errorMessage", result.error);
      return;
    }
    emitGame(table);
    playMibsIfNeeded(table);
  });

  socket.on("disconnect", () => {
    leaveTable(socket);
    sockets.delete(socket.id);
  });
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
    for (const seat of table.seats) io.to(seat.socketId).emit("waiting", waitingView(table));
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

server.listen(PORT, () => {
  console.log(`Black Friday Desk listening on http://localhost:${PORT}`);
});
