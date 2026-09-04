# Night Shift Horror multiplayer server

This version uses the Node.js server as the **public lobby directory** and PeerJS as the player-to-player transport.

## How public servers work

There are 10 public lobby slots. When a player chooses Server 1, the browser first creates an anonymous PeerJS connection and registers that peer ID with `/api/lobbies/1/join`.

- If Server 1 is empty, that player becomes the host.
- If Server 1 already has a host, the Node server returns the real host PeerJS ID and the new player connects directly to that host.
- The host remains authoritative for the shared map, level, boss, fuses, exit, and player roster.
- The Node server keeps the lobby listing/counts alive with heartbeats and removes stale players.

This avoids the old fixed PeerJS ID race where two devices could each think they created the same public server.

## Deploy

Deploy this whole folder to one Node.js host with HTTPS and WebSocket support (Render, Railway, Fly.io, a VPS, etc.). Start with:

```bash
npm install
npm start
```

Open the single HTTPS URL from both devices. Do not open `index.html` with `file://` and do not mix different site URLs.

## Local test

On the computer running the server:

```bash
npm install
npm start
```

Then open `http://YOUR-COMPUTER-LAN-IP:3000` on the computer and phone while they are on the same Wi-Fi.

The public lobby list comes from:

- `GET /api/lobbies`
- `POST /api/lobbies/:number/join`
- `POST /api/lobbies/:number/heartbeat`
- `POST /api/lobbies/:number/leave`

PeerJS is mounted at `/peerjs` on the same server.

## Important

The public lobby directory is in-memory. If the Node server restarts, all public lobby registrations disappear and players simply create/join the fresh rooms again. The actual game world is still authoritative on the host browser, so a host disconnect ends that game session.
