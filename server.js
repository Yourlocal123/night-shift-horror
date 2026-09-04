const express = require("express");
const http = require("http");
const path = require("path");
const { ExpressPeerServer } = require("peer");

const port = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.json({limit:"32kb"}));

// PeerJS is only the transport/signalling layer. The game server below is the
// actual public-lobby directory: it decides which PeerJS host belongs to each
// public server number and tracks who is currently registered there.
const peerServer = ExpressPeerServer(server, {
  proxied: true,
  allow_discovery: false,
});
app.use("/peerjs", peerServer);

const PUBLIC_SERVERS = 10;
const MAX_PLAYERS = 10;
const LOBBY_TTL_MS = 15_000;
const lobbies = new Map();

function cleanName(value){
  return String(value || "Player").trim().slice(0,16) || "Player";
}
function lobbyNumber(value){
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= PUBLIC_SERVERS ? n : null;
}
function getLobby(n){
  if(!lobbies.has(n)) lobbies.set(n,{hostPeerId:"", hostName:"", players:new Map(), updatedAt:Date.now()});
  return lobbies.get(n);
}
function pruneLobbies(){
  const now=Date.now();
  for(const [n,lobby] of lobbies){
    if(!lobby.hostPeerId || now-lobby.updatedAt>LOBBY_TTL_MS){
      lobbies.delete(n);
      continue;
    }
    for(const [peerId,p] of lobby.players){
      if(now-p.lastSeen>LOBBY_TTL_MS) lobby.players.delete(peerId);
    }
    if(!lobby.players.has(lobby.hostPeerId)){
      lobby.players.set(lobby.hostPeerId,{peerId:lobby.hostPeerId,name:lobby.hostName,lastSeen:now,host:true});
    }
  }
}
setInterval(pruneLobbies,5_000).unref();

app.get("/api/lobbies", (_req,res)=>{
  pruneLobbies();
  const out=[];
  for(let n=1;n<=PUBLIC_SERVERS;n++){
    const lobby=lobbies.get(n);
    const players=lobby?[...lobby.players.values()].map(p=>({peerId:p.peerId,name:p.name,host:!!p.host})):[];
    out.push({number:n,online:!!lobby?.hostPeerId,count:Math.min(MAX_PLAYERS,players.length),players});
  }
  res.json({servers:out});
});

app.post("/api/lobbies/:number/join", (req,res)=>{
  pruneLobbies();
  const n=lobbyNumber(req.params.number);
  if(!n) return res.status(400).json({error:"invalid_server"});
  const peerId=String(req.body?.peerId||"").trim();
  const name=cleanName(req.body?.name);
  if(!peerId) return res.status(400).json({error:"missing_peer_id"});

  const lobby=getLobby(n);
  for(const p of lobby.players.values()){
    if(p.name.toLowerCase()===name.toLowerCase() && p.peerId!==peerId){
      return res.status(409).json({error:"name_taken"});
    }
  }
  if(lobby.hostPeerId && !lobby.players.has(peerId) && lobby.players.size>=MAX_PLAYERS){
    return res.status(409).json({error:"full"});
  }

  const now=Date.now();
  if(!lobby.hostPeerId){
    lobby.hostPeerId=peerId;
    lobby.hostName=name;
    lobby.players.set(peerId,{peerId,name,lastSeen:now,host:true});
    lobby.updatedAt=now;
    return res.json({ok:true,role:"host",server:n,hostPeerId:peerId,count:lobby.players.size});
  }

  const existing=lobby.players.get(peerId);
  lobby.players.set(peerId,{peerId,name,lastSeen:now,host:peerId===lobby.hostPeerId});
  lobby.updatedAt=now;
  return res.json({ok:true,role:peerId===lobby.hostPeerId?"host":"client",server:n,hostPeerId:lobby.hostPeerId,count:lobby.players.size});
});

app.post("/api/lobbies/:number/heartbeat", (req,res)=>{
  pruneLobbies();
  const n=lobbyNumber(req.params.number);
  const peerId=String(req.body?.peerId||"").trim();
  if(!n||!peerId) return res.status(400).json({error:"invalid_request"});
  const lobby=lobbies.get(n);
  const p=lobby?.players.get(peerId);
  if(!lobby||!p) return res.status(404).json({error:"not_registered"});
  p.lastSeen=Date.now();
  lobby.updatedAt=p.lastSeen;
  res.json({ok:true,hostPeerId:lobby.hostPeerId});
});

app.post("/api/lobbies/:number/leave", (req,res)=>{
  const n=lobbyNumber(req.params.number);
  const peerId=String(req.body?.peerId||"").trim();
  if(!n||!peerId) return res.status(400).json({error:"invalid_request"});
  const lobby=lobbies.get(n);
  if(!lobby) return res.json({ok:true});
  if(peerId===lobby.hostPeerId){
    lobbies.delete(n);
    return res.json({ok:true,closed:true});
  }
  lobby.players.delete(peerId);
  lobby.updatedAt=Date.now();
  res.json({ok:true});
});

app.use(express.static(path.join(__dirname)));
app.get("*", (_request, response) => response.sendFile(path.join(__dirname, "index.html")));

server.listen(port, "0.0.0.0", () => {
  console.log(`Night Shift Horror server listening on port ${port}`);
});
