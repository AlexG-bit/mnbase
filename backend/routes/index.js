const authRoute = require("./auth");

async function router(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  const authHandled = await authRoute(req, res, pathname);
  if (authHandled) return true;

  return false;
}

module.exports = { router };