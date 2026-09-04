const express = require("express");
const http = require("http");
const path = require("path");
const { ExpressPeerServer } = require("peer");
const { Server } = require("socket.io");

const port = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
io.on("connection", socket => {
  socket.on("join-public", room => {
    const previous = rooms.get(room);
    const host = previous?.host || socket.id;
    if (!previous) rooms.set(room, { host, members: new Set() });
    rooms.get(room).members.add(socket.id);
    socket.data.room = room; socket.data.host = host === socket.id;
    socket.join(room); socket.emit("room-role", { host: socket.data.host, hostId: host });
  });
  socket.on("room-message", data => { const r=rooms.get(socket.data.room); if(!r)return; if(socket.id===r.host) socket.to(socket.data.room).emit("room-message",{from:socket.id,data}); else io.to(r.host).emit("room-message",{from:socket.id,data}); });
  socket.on("direct-message", ({to,data}) => io.to(to).emit("room-message",{from:socket.id,data}));
  socket.on("disconnect", () => { const r=rooms.get(socket.data.room); if(!r)return; r.members.delete(socket.id); if(socket.id===r.host){ rooms.delete(socket.data.room); io.to(socket.data.room).emit("host-left"); } else io.to(r.host).emit("peer-left",socket.id); });
});

// This endpoint is the one shared lobby directory for every player.
// Deploy behind HTTPS; platforms that terminate TLS must proxy WebSockets.
const peerServer = ExpressPeerServer(server, {
  proxied: true,
  allow_discovery: false,
});

app.use("/peerjs", peerServer);
app.use(express.static(path.join(__dirname)));
app.get("*", (_request, response) => response.sendFile(path.join(__dirname, "index.html")));

server.listen(port, "0.0.0.0", () => {
  console.log(`Night Shift Horror is listening on port ${port}`);
});
