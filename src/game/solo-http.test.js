process.env.BFD_NO_LISTEN = "1";

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { io as ioc } from "socket.io-client";

const { server, io } = await import("../../server/index.js");

let port = 0;

function connect() {
  const socket = ioc(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
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
});
