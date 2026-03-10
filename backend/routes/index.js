const authRoute = require("./auth");

async function router(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  const handled = await authRoute(req, res, pathname);
  if (handled) {
    return true;
  }

  return false;
}

module.exports = { router };