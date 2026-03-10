const http = require("http");

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${PORT}`);
});