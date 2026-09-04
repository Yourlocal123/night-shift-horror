const express = require("express");
const http = require("http");
const path = require("path");
const { ExpressPeerServer } = require("peer");

const port = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: "32kb" }));

// PeerJS signaling server used by every Night Shift player.
const peerServer = ExpressPeerServer(server, {
  proxied: true,
  allow_discovery: false,
});
app.use("/peerjs", peerServer);

const PUBLIC_SERVERS = 10;
const MAX_PLAYERS = 10;
const LOBBY_TTL_MS = 15000;
const lobbies = new Map();

function cleanName(name) {
  return String(name || "Player").trim().slice(0, 16) || "Player";
}

function lobbyNumber(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= PUBLIC_SERVERS ? n : null;
}

function getLobby(number) {
  if (!lobbies.has(number)) {
    lobbies.set(number, {
      hostPeerId: `nightshift-public-${number}`,
      players: new Map(),
      updatedAt: Date.now(),
    });
  }
  return lobbies.get(number);
}

function pruneLobbies() {
  const now = Date.now();
  for (const [number, lobby] of lobbies) {
    for (const [playerKey, player] of lobby.players) {
      if (now - player.lastSeen > LOBBY_TTL_MS) {
        lobby.players.delete(playerKey);
      }
    }
    if (lobby.players.size === 0) lobbies.delete(number);
  }
}

setInterval(pruneLobbies, 5000).unref();

app.get("/api/lobbies", (_req, res) => {
  pruneLobbies();
  const result = [];
  for (let number = 1; number <= PUBLIC_SERVERS; number++) {
    const lobby = lobbies.get(number);
    result.push({
      number,
      players: lobby ? lobby.players.size : 0,
      maxPlayers: MAX_PLAYERS,
      online: !!lobby,
    });
  }
  res.json(result);
});

app.post("/api/lobbies/:number/join", (req, res) => {
  pruneLobbies();
  const number = lobbyNumber(req.params.number);
  if (!number) return res.status(400).json({ error: "Invalid public server." });

  const lobby = getLobby(number);
  if (lobby.players.size >= MAX_PLAYERS) {
    return res.status(409).json({ error: "That server is full.", players: lobby.players.size });
  }

  const name = cleanName(req.body?.name);
  const nameLower = name.toLowerCase();
  for (const player of lobby.players.values()) {
    if (player.name.toLowerCase() === nameLower) {
      return res.status(409).json({ error: "That name is already in this lobby." });
    }
  }

  const playerKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const role = lobby.players.size === 0 ? "host" : "client";
  lobby.players.set(playerKey, {
    key: playerKey,
    name,
    lastSeen: Date.now(),
  });
  lobby.updatedAt = Date.now();

  res.json({
    ok: true,
    number,
    role,
    playerKey,
    hostPeerId: lobby.hostPeerId,
    players: lobby.players.size,
    maxPlayers: MAX_PLAYERS,
  });
});

app.post("/api/lobbies/:number/heartbeat", (req, res) => {
  pruneLobbies();
  const number = lobbyNumber(req.params.number);
  if (!number) return res.status(400).json({ error: "Invalid public server." });
  const lobby = lobbies.get(number);
  if (!lobby) return res.status(404).json({ error: "Lobby no longer exists." });

  const playerKey = String(req.body?.playerKey || "");
  const player = lobby.players.get(playerKey);
  if (!player) return res.status(404).json({ error: "Player is no longer in the lobby." });

  player.lastSeen = Date.now();
  lobby.updatedAt = Date.now();
  res.json({ ok: true, players: lobby.players.size });
});

app.post("/api/lobbies/:number/leave", (req, res) => {
  const number = lobbyNumber(req.params.number);
  if (!number) return res.status(400).json({ error: "Invalid public server." });
  const lobby = lobbies.get(number);
  if (!lobby) return res.json({ ok: true });

  const playerKey = String(req.body?.playerKey || "");
  lobby.players.delete(playerKey);
  if (lobby.players.size === 0) lobbies.delete(number);
  else lobby.updatedAt = Date.now();

  res.json({ ok: true });
});

app.get("/health", (_req, res) => res.json({ ok: true, lobbies: lobbies.size }));

app.use(express.static(path.join(__dirname)));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

server.listen(port, "0.0.0.0", () => {
  console.log(`Night Shift Horror multiplayer server listening on port ${port}`);
});
