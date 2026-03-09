if (pathname === "/api/auth/login" && req.method === "POST") {

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {

      const { identifier, password } = JSON.parse(body);

      if (!identifier || !password) {
        return sendJson(res, 400, { error: "Missing credentials" });
      }

      const user = users.find(
        u => u.username === identifier || u.email === identifier
      );

      if (!user) {
        return sendJson(res, 401, { error: "Invalid username/email or password" });
      }

      if (user.password !== password) {
        return sendJson(res, 401, { error: "Invalid username/email or password" });
      }

      const token = generateToken(user);

      return sendJson(res, 200, {
        token,
        username: user.username,
        email: user.email
      });

    } catch (err) {
      return sendJson(res, 500, { error: "Login failed" });
    }
  });

  return;
}