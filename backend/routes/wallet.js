const crypto = require("crypto");
const pool = require("../db/postgres");
const {
  verifyToken,
  getBearerToken,
  sendJson,
  parseBody
} = require("./helpers");

async function getCurrentUser(req) {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing authorization token." };

  const payload = verifyToken(token);
  if (!payload) return { error: "Invalid or expired token." };

  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [payload.sub]
  );

  const user = result.rows[0];
  if (!user) return { error: "User not found." };

  return { user };
}

function parseTransactions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

function makeInviteCode(username, userId) {
  const base = String(username || "mnbase").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "MNBASE";
  return `${base}-${String(userId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

async function ensureUserProfile(user) {
  const result = await pool.query(
    `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  let profile = result.rows[0];

  if (!profile) {
    const newProfile = {
      id: crypto.randomUUID(),
      user_id: user.id,
      profile_picture_url: "",
      invite_code: makeInviteCode(user.username, user.id),
      invite_count: 0,
      invite_reward_balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO user_profiles (
        id, user_id, profile_picture_url, invite_code,
        invite_count, invite_reward_balance, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        newProfile.id,
        newProfile.user_id,
        newProfile.profile_picture_url,
        newProfile.invite_code,
        newProfile.invite_count,
        newProfile.invite_reward_balance,
        newProfile.created_at,
        newProfile.updated_at
      ]
    );

    profile = newProfile;
  }

  return profile;
}

async function ensureKycProfile(user) {
  const result = await pool.query(
    `SELECT * FROM kyc_profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  let kyc = result.rows[0];

  if (!kyc) {
    const newKyc = {
      id: crypto.randomUUID(),
      user_id: user.id,
      status: "not_started",
      full_name: "",
      country: "",
      document_type: "",
      document_number: "",
      address_line: "",
      city: "",
      state_region: "",
      postal_code: "",
      submitted_at: null,
      verified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO kyc_profiles (
        id, user_id, status, full_name, country, document_type, document_number,
        address_line, city, state_region, postal_code,
        submitted_at, verified_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        newKyc.id,
        newKyc.user_id,
        newKyc.status,
        newKyc.full_name,
        newKyc.country,
        newKyc.document_type,
        newKyc.document_number,
        newKyc.address_line,
        newKyc.city,
        newKyc.state_region,
        newKyc.postal_code,
        newKyc.submitted_at,
        newKyc.verified_at,
        newKyc.created_at,
        newKyc.updated_at
      ]
    );

    kyc = newKyc;
  }

  return kyc;
}

async function walletRoute(req, res, pathname) {
  if (pathname === "/api/wallet/me" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const { user } = result;
      const profile = await ensureUserProfile(user);
      const kyc = await ensureKycProfile(user);

      sendJson(res, 200, {
        username: user.username,
        email: user.email,
        role: user.role,
        balance: Number(user.balance || 0),
        cardActivated: !!user.card_activated,
        cardBalance: Number(user.card_balance || 0),
        wallets: user.wallets || {},
        transactions: parseTransactions(user.transactions),
        profilePictureUrl: profile.profile_picture_url || "",
        inviteCode: profile.invite_code || "",
        inviteCount: Number(profile.invite_count || 0),
        inviteRewardBalance: Number(profile.invite_reward_balance || 0),
        kyc: {
          status: kyc.status || "not_started",
          fullName: kyc.full_name || "",
          country: kyc.country || "",
          documentType: kyc.document_type || "",
          documentNumber: kyc.document_number || "",
          addressLine: kyc.address_line || "",
          city: kyc.city || "",
          stateRegion: kyc.state_region || "",
          postalCode: kyc.postal_code || "",
          submittedAt: kyc.submitted_at || null,
          verifiedAt: kyc.verified_at || null
        }
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load wallet profile." });
      return true;
    }
  }

  if (pathname === "/api/wallet/history" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const history = await pool.query(
        `SELECT id, user_id, type, amount, asset, message, created_at
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [result.user.id]
      );

      sendJson(res, 200, {
        transactions: history.rows.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount || 0),
          asset: tx.asset || "USD",
          message: tx.message || "",
          createdAt: tx.created_at
        }))
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load wallet history." });
      return true;
    }
  }

  if (pathname === "/api/wallet/action-controls" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const controls = await pool.query(
        `SELECT id, action_type, title, body, is_active, updated_at
         FROM user_action_controls
         WHERE user_id = $1 AND is_active = true
         ORDER BY updated_at DESC`,
        [result.user.id]
      );

      sendJson(res, 200, { controls: controls.rows });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load action controls." });
      return true;
    }
  }

  if (pathname === "/api/wallet/receive-assets" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const wallets = result.user.wallets || {};

      sendJson(res, 200, {
        assets: [
          { symbol: "BTC", name: "Bitcoin", address: wallets.BTC || "BTC_ADDRESS_NOT_AVAILABLE" },
          { symbol: "ETH", name: "Ethereum", address: wallets.ETH || "ETH_ADDRESS_NOT_AVAILABLE" },
          { symbol: "USDT", name: "Tether", address: wallets.USDT || "USDT_ADDRESS_NOT_AVAILABLE" }
        ]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load receive assets." });
      return true;
    }
  }

  if (pathname === "/api/wallet/convert-options" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, {
        assets: ["BTC", "ETH", "USDT"],
        localCurrencies: ["USD", "EUR", "GBP", "NGN"]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load convert options." });
      return true;
    }
  }

  if (pathname === "/api/wallet/kyc" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const body = await parseBody(req);
      const fullName = String(body.fullName || "").trim();
      const country = String(body.country || "").trim();
      const documentType = String(body.documentType || "").trim();
      const documentNumber = String(body.documentNumber || "").trim();
      const addressLine = String(body.addressLine || "").trim();
      const city = String(body.city || "").trim();
      const stateRegion = String(body.stateRegion || "").trim();
      const postalCode = String(body.postalCode || "").trim();

      if (!fullName || !country || !documentType || !documentNumber || !addressLine || !city || !stateRegion || !postalCode) {
        sendJson(res, 400, { error: "All KYC fields are required." });
        return true;
      }

      await ensureKycProfile(result.user);

      await pool.query(
        `UPDATE kyc_profiles
         SET status = $1,
             full_name = $2,
             country = $3,
             document_type = $4,
             document_number = $5,
             address_line = $6,
             city = $7,
             state_region = $8,
             postal_code = $9,
             submitted_at = $10,
             verified_at = $11,
             updated_at = $12
         WHERE user_id = $13`,
        [
          "verified",
          fullName,
          country,
          documentType,
          documentNumber,
          addressLine,
          city,
          stateRegion,
          postalCode,
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
          result.user.id
        ]
      );

      sendJson(res, 200, {
        message: "KYC submitted successfully.",
        status: "verified"
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to submit KYC." });
      return true;
    }
  }

  if (pathname === "/api/wallet/profile-picture" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const body = await parseBody(req);
      const profilePictureUrl = String(body.profilePictureUrl || "").trim();

      await ensureUserProfile(result.user);

      await pool.query(
        `UPDATE user_profiles
         SET profile_picture_url = $1,
             updated_at = $2
         WHERE user_id = $3`,
        [profilePictureUrl, new Date().toISOString(), result.user.id]
      );

      sendJson(res, 200, { message: "Profile picture updated successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to update profile picture." });
      return true;
    }
  }

  if (pathname === "/api/wallet/delete-account" && req.method === "POST") {
    const client = await pool.connect();
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      await client.query("BEGIN");

      await client.query(`DELETE FROM user_action_controls WHERE user_id = $1`, [result.user.id]);
      await client.query(`DELETE FROM kyc_profiles WHERE user_id = $1`, [result.user.id]);
      await client.query(`DELETE FROM user_profiles WHERE user_id = $1`, [result.user.id]);
      await client.query(`DELETE FROM transactions WHERE user_id = $1`, [result.user.id]);
      await client.query(`DELETE FROM users WHERE id = $1`, [result.user.id]);

      await client.query("COMMIT");

      sendJson(res, 200, { message: "Account deleted successfully." });
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      sendJson(res, 500, { error: err.message || "Failed to delete account." });
      return true;
    } finally {
      client.release();
    }
  }

  if (pathname === "/api/wallet/market-data" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, {
        assets: [
          { symbol: "BTC", name: "Bitcoin", price: 67250.45, change24h: 2.14 },
          { symbol: "ETH", name: "Ethereum", price: 3485.19, change24h: 1.42 },
          { symbol: "USDT", name: "Tether", price: 1.0, change24h: 0.0 },
          { symbol: "SOL", name: "Solana", price: 154.72, change24h: 3.18 }
        ]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load market data." });
      return true;
    }
  }

  if (pathname === "/api/wallet/news" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, {
        news: [
          {
            id: "1",
            title: "Digital asset adoption continues to expand globally",
            summary: "Financial institutions and payment providers continue to broaden digital asset access and infrastructure.",
            category: "Market Update"
          },
          {
            id: "2",
            title: "Security and compliance remain a core focus across wallet platforms",
            summary: "Verification, account controls, and transaction monitoring continue to shape user access standards.",
            category: "Compliance"
          },
          {
            id: "3",
            title: "Multi-network wallet infrastructure sees stronger demand",
            summary: "Users increasingly prefer platforms that support multiple payment and blockchain workflows in one environment.",
            category: "Industry Insight"
          }
        ]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load news." });
      return true;
    }
  }

  if (pathname === "/api/wallet/send" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, { message: "Send unlocked." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Send request failed." });
      return true;
    }
  }

  if (pathname === "/api/wallet/withdraw" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, { message: "Withdraw unlocked." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Withdraw request failed." });
      return true;
    }
  }

  return false;
}

module.exports = walletRoute;