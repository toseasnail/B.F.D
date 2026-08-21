process.env.BFD_NO_LISTEN = "1";

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { io as ioc } from "socket.io-client";
import { DESK_VERSION } from "./constants.js";

const { server, io } = await import("../../server/index.js");

let port = 0;

function connect(playerId) {
  const socket = ioc(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    auth: playerId ? { playerId } : {},
  });
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

describe("solo transport", () => {
  before(async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
  });

  after(async () => {
    io.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it("POST /api/solo seats four automas", async () => {
    const socket = await connect();
    const res = await fetch(`http://127.0.0.1:${port}/api/solo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socketId: socket.id,
        name: "Jung-hyeon",
        difficulty: "hard:4",
        mibsCount: 4,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200, data.error);
    assert.equal(data.mibsCount, 4);
    assert.equal(data.players.filter((p) => p.isMibs).length, 4);
    assert.equal(data.view.players.filter((p) => p.isMibs).length, 4);
    assert.deepEqual(
      data.view.players.filter((p) => p.isMibs).map((p) => p.name),
      [
        "M.I.B.S. 1/4 (Hard)",
        "M.I.B.S. 2/4 (Hard)",
        "M.I.B.S. 3/4 (Hard)",
        "M.I.B.S. 4/4 (Hard)",
      ]
    );
    socket.close();
  });

  it("socket string hard:3 seats three automas", async () => {
    const socket = await connect();
    const game = await new Promise((resolve, reject) => {
      socket.once("game", resolve);
      socket.once("errorMessage", reject);
      socket.emit("solo", "easy:3");
    });
    assert.equal(game.view.players.filter((p) => p.isMibs).length, 3);
    assert.equal(game.view.mibsCount, 3);
    socket.close();
  });

  it("resumes a solo desk after disconnect and stamps a ticket", async () => {
    const playerId = "junghyeon-stamp-01";
    const socket = await connect(playerId);
    const res = await fetch(`http://127.0.0.1:${port}/api/solo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socketId: socket.id,
        name: "Jung-hyeon",
        difficulty: "easy:1",
        mibsCount: 1,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200, data.error);
    assert.equal(data.view.you, playerId);
    socket.close();

    const socket2 = ioc(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { playerId },
      autoConnect: false,
    });
    const first = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("did not resume the desk")), 4000);
      socket2.once("game", (payload) => {
        clearTimeout(t);
        resolve(payload);
      });
      socket2.connect();
    });
    assert.equal(first.view.you, playerId);

    const view = await new Promise((resolve, reject) => {
      if (first.view.currentPlayerId === playerId) {
        resolve(first.view);
        return;
      }
      const t = setTimeout(() => reject(new Error("never became my turn")), 8000);
      const onGame = (payload) => {
        if (payload.view.currentPlayerId === playerId) {
          clearTimeout(t);
          socket2.off("game", onGame);
          resolve(payload.view);
        }
      };
      socket2.on("game", onGame);
    });
    assert.equal(view.you, playerId);

    const after = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("stamp was ignored")), 4000);
      socket2.once("errorMessage", (message) => {
        clearTimeout(t);
        reject(new Error(message));
      });
      socket2.once("game", (payload) => {
        clearTimeout(t);
        resolve(payload);
      });
      socket2.emit("action", {
        type: "buyShares",
        buys: { purple: 0, yellow: 0, green: 0, blue: 0, white: 0 },
        trackColor: "purple",
      });
    });
    assert.notEqual(after.view.currentPlayerId, playerId);
    socket2.close();
  });

  it("health reports the live desk version and does not cache", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await res.json();
    assert.equal(data.version, DESK_VERSION);
    assert.match(String(res.headers.get("cache-control") || ""), /no-store/);
  });

  it("lobby payload includes the desk version", async () => {
    const socket = ioc(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      autoConnect: false,
    });
    const lobby = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("no lobby")), 4000);
      socket.once("lobby", (payload) => {
        clearTimeout(t);
        resolve(payload);
      });
      socket.once("connect_error", (err) => {
        clearTimeout(t);
        reject(err);
      });
      socket.connect();
    });
    assert.equal(lobby.version, DESK_VERSION);
    socket.close();
  });
});
