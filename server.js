const express = require("express");
const http = require("http");
const path = require("path");
const { ExpressPeerServer } = require("peer");

const port = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);

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
