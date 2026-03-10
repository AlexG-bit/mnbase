const authRoute = require("./auth");
const walletRoute = require("./wallet");
const adminRoute = require("./admin");

async function router(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (await authRoute(req, res, pathname)) return true;
  if (await walletRoute(req, res, pathname)) return true;
  if (await adminRoute(req, res, pathname)) return true;

  return false;
}

module.exports = { router };