const authRoute = require("./auth");

function router(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  const handled = authRoute(req, res, pathname);
  if (handled !== false) {
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found"
    })
  );
}

module.exports = { router };