const express = require("express");
const http = require("http");
const path = require("path");
const { ExpressPeerServer } = require("peer");
const { Server } = require("socket.io");
const { WebSocketServer } = require("ws");

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
// Native WebSocket relay: avoids WebRTC/NAT issues for public game rooms.
const relayRooms = new Map();
const relayClients = new Map(); let relayNextId = 1;
const relay = new WebSocketServer({ server, path: "/relay" });
const relaySend = (client,event,data) => { if(client.readyState===client.OPEN) client.send(JSON.stringify({event,data})); };
relay.on("connection", client => {
  const id=`r${relayNextId++}`; relayClients.set(id,client); client.id=id;
  client.on("message", raw => { let msg;try{msg=JSON.parse(raw)}catch{return}; const data=msg.data;
    if(msg.event==="join-public"){const room=String(data);let r=relayRooms.get(room);if(!r){r={host:id,members:new Set()};relayRooms.set(room,r)}r.members.add(id);client.room=room;relaySend(client,"room-role",{host:r.host===id,hostId:r.host});}
    if(msg.event==="room-message"){const r=relayRooms.get(client.room);if(!r)return;const targets=client.id===r.host?[...r.members].filter(x=>x!==client.id):[r.host];for(const target of targets){const c=relayClients.get(target);if(c)relaySend(c,"room-message",{from:id,data});}}
    if(msg.event==="direct-message"){const c=relayClients.get(data?.to);if(c)relaySend(c,"room-message",{from:id,data:data.data});}
  });
  client.on("close",()=>{relayClients.delete(id);const r=relayRooms.get(client.room);if(!r)return;r.members.delete(id);if(r.host===id){relayRooms.delete(client.room);for(const member of r.members){const c=relayClients.get(member);if(c)relaySend(c,"host-left",{});}}else{const c=relayClients.get(r.host);if(c)relaySend(c,"peer-left",id);}});
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
