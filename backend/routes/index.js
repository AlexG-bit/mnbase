const authRoute = require("./auth");
const walletRoute = require("./wallet");

async function router(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  const authHandled = await authRoute(req, res, pathname);
  if (authHandled) return true;

  const walletHandled = await walletRoute(req, res, pathname);
  if (walletHandled) return true;

  return false;
}

module.exports = { router };