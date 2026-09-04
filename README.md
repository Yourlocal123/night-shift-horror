# Night Shift Horror multiplayer deployment

This folder contains the corrected game (`index.html`) and its shared PeerJS
signalling server. They must be deployed **together on one Node.js host**. Do
not upload only `index.html` to a static-file host: that leaves the public room
directory on PeerJS Cloud, so it cannot be treated as your game's server.

## Deploy

1. Upload this whole folder to a Node.js host that supports WebSockets and HTTPS
   (for example Render, Railway, Fly.io, or a VPS).
2. Set the start command to `npm start`. The host supplies `PORT` automatically.
3. Open the single HTTPS URL provided by the host on both devices. Do not use
   `file:///...`, an old uploaded HTML page, or different site URLs.

The page connects to `/peerjs` on its own origin. Therefore Server 1 has one
fixed shared lobby ID for every visitor to that deployed URL. The first player
is still the in-game host; if that player disconnects, the room ends and the
next joiner starts a new session. Persistent worlds would need a separate game
state database and an always-running authoritative game server.

## Test before deployment

Run `npm install`, then `npm start`. Open `http://<your-computer-LAN-IP>:3000`
on both devices while they are on the same Wi-Fi. For Internet players, use the
public HTTPS deployment URL instead.
