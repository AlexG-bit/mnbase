function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function ok(res, data) { send(res, 200, { success: true, ...data }); }
function created(res, data) { send(res, 201, { success: true, ...data }); }
function badRequest(res, msg) { send(res, 400, { success: false, message: msg }); }
function unauthorized(res, msg) { send(res, 401, { success: false, message: msg || 'Unauthorized' }); }
function notFound(res, msg) { send(res, 404, { success: false, message: msg || 'Not found' }); }
function serverError(res, msg) { send(res, 500, { success: false, message: msg || 'Server error' }); }
module.exports = { ok, created, badRequest, unauthorized, notFound, serverError };