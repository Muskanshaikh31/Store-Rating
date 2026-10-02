import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { auth, allowRoles, signToken } from "./auth.js";
import {
  validateUser, validateName, validateEmail, validatePassword,
  validateAddress, validateRating
} from "./validation.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

function cleanUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address,
    role: row.role
  };
}

async function ensureAdmin() {
  const { rows } = await query("SELECT id FROM users WHERE email = $1", ["admin@example.com"]);
  if (!rows.length) {
    const hash = await bcrypt.hash("Admin@12345", 10);
    await query(
      `INSERT INTO users(name,email,password_hash,address,role)
       VALUES($1,$2,$3,$4,$5)`,
      [
        "System Administrator Account",
        "admin@example.com",
        hash,
        "Admin Office"
        ,"SYSTEM_ADMIN"
      ]
    );
    console.log("Default admin created: admin@example.com / Admin@12345");
  }
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- AUTH ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, address } = req.body;
    const errors = validateUser(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const existing = await query("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);
    if (existing.rows.length) return res.status(409).json({ message: "Email already registered." });

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users(name,email,password_hash,address,role)
       VALUES($1,$2,$3,$4,'NORMAL_USER')
       RETURNING id,name,email,address,role`,
      [name.trim(), email.trim().toLowerCase(), hash, address?.trim() || null]
    );

    const user = result.rows[0];
    res.status(201).json({ user, token: signToken(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    const result = await query("SELECT * FROM users WHERE lower(email)=lower($1)", [email]);
    if (!result.rows.length) return res.status(401).json({ message: "Invalid email or password." });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password." });

    res.json({ user: cleanUser(user), token: signToken(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Login failed." });
  }
});

app.put("/api/auth/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const error = validatePassword(newPassword);
    if (error) return res.status(400).json({ message: error });

    const result = await query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ message: "User not found." });

    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect." });

    const hash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, req.user.id]);
    res.json({ message: "Password updated successfully." });
  } catch (e) {
    res.status(500).json({ message: "Could not update password." });
  }
});

// ---------- ADMIN ----------
app.get("/api/admin/dashboard", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  const [users, stores, ratings] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM users"),
    query("SELECT COUNT(*)::int AS count FROM stores"),
    query("SELECT COUNT(*)::int AS count FROM ratings")
  ]);
  res.json({
    users: users.rows[0].count,
    stores: stores.rows[0].count,
    ratings: ratings.rows[0].count
  });
});

app.get("/api/admin/users", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  const { search = "", role = "", sort = "name", direction = "asc" } = req.query;
  const allowedSort = {
    name: "u.name", email: "u.email", address: "u.address", role: "u.role"
  };
  const sortCol = allowedSort[sort] || "u.name";
  const dir = direction === "desc" ? "DESC" : "ASC";

  const values = [];
  const where = [];
  if (search) {
    values.push(`%${search}%`);
    where.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR u.address ILIKE $${values.length})`);
  }
  if (role) {
    values.push(role);
    where.push(`u.role = $${values.length}`);
  }

  const result = await query(
    `SELECT u.id,u.name,u.email,u.address,u.role,
            CASE WHEN u.role='STORE_OWNER'
                 THEN COALESCE(ROUND(AVG(r.rating)::numeric,2),0)
                 ELSE NULL END AS rating
     FROM users u
     LEFT JOIN stores s ON s.owner_id=u.id
     LEFT JOIN ratings r ON r.store_id=s.id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     GROUP BY u.id
     ORDER BY ${sortCol} ${dir}`,
    values
  );
  res.json(result.rows);
});

app.post("/api/admin/users", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  try {
    const errors = validateUser(req.body);
    if (req.body.role && !["SYSTEM_ADMIN", "NORMAL_USER", "STORE_OWNER"].includes(req.body.role)) {
      errors.role = "Invalid role.";
    }
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const exists = await query("SELECT id FROM users WHERE lower(email)=lower($1)", [req.body.email]);
    if (exists.rows.length) return res.status(409).json({ message: "Email already exists." });

    const hash = await bcrypt.hash(req.body.password, 10);
    const result = await query(
      `INSERT INTO users(name,email,password_hash,address,role)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id,name,email,address,role`,
      [
        req.body.name.trim(), req.body.email.trim().toLowerCase(), hash,
        req.body.address?.trim() || null, req.body.role || "NORMAL_USER"
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Could not create user." });
  }
});

app.get("/api/admin/stores", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  const { search = "", sort = "name", direction = "asc" } = req.query;
  const allowedSort = { name: "s.name", email: "s.email", address: "s.address", rating: "rating" };
  const col = allowedSort[sort] || "s.name";
  const dir = direction === "desc" ? "DESC" : "ASC";

  const values = search ? [`%${search}%`] : [];
  const result = await query(
    `SELECT s.id,s.name,s.email,s.address,
            COALESCE(ROUND(AVG(r.rating)::numeric,2),0) AS rating
     FROM stores s
     LEFT JOIN ratings r ON r.store_id=s.id
     ${search ? "WHERE (s.name ILIKE $1 OR s.email ILIKE $1 OR s.address ILIKE $1)" : ""}
     GROUP BY s.id
     ORDER BY ${col} ${dir}`,
    values
  );
  res.json(result.rows);
});

app.post("/api/admin/stores", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  const { name, email, address, ownerId } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Store name is required." });
  const addressError = validateAddress(address || "");
  if (addressError) return res.status(400).json({ message: addressError });
  if (email && validateEmail(email)) return res.status(400).json({ message: "Invalid store email." });

  try {
    const result = await query(
      `INSERT INTO stores(name,email,address,owner_id)
       VALUES($1,$2,$3,$4)
       RETURNING id,name,email,address,owner_id`,
      [name.trim(), email?.trim() || null, address?.trim() || "", ownerId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Could not create store. Owner may already own a store." });
  }
});

app.get("/api/admin/users/:id", auth, allowRoles("SYSTEM_ADMIN"), async (req, res) => {
  const result = await query(
    `SELECT u.id,u.name,u.email,u.address,u.role,
      CASE WHEN u.role='STORE_OWNER'
      THEN COALESCE(ROUND(AVG(r.rating)::numeric,2),0) ELSE NULL END AS rating
     FROM users u
     LEFT JOIN stores s ON s.owner_id=u.id
     LEFT JOIN ratings r ON r.store_id=s.id
     WHERE u.id=$1
     GROUP BY u.id`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ message: "User not found." });
  res.json(result.rows[0]);
});

// ---------- NORMAL USER ----------
app.get("/api/stores", auth, allowRoles("NORMAL_USER"), async (req, res) => {
  const { search = "", sort = "name", direction = "asc" } = req.query;
  const allowedSort = { name: "s.name", address: "s.address", rating: "overall_rating", userRating: "user_rating" };
  const col = allowedSort[sort] || "s.name";
  const dir = direction === "desc" ? "DESC" : "ASC";

  const values = [req.user.id];
  let where = "";
  if (search) {
    values.push(`%${search}%`);
    where = "WHERE s.name ILIKE $2 OR s.address ILIKE $2";
  }

  const result = await query(
    `SELECT s.id,s.name,s.address,
      COALESCE(ROUND(AVG(allr.rating)::numeric,2),0) AS overall_rating,
      MAX(myr.rating) AS user_rating
     FROM stores s
     LEFT JOIN ratings allr ON allr.store_id=s.id
     LEFT JOIN ratings myr ON myr.store_id=s.id AND myr.user_id=$1
     ${where}
     GROUP BY s.id
     ORDER BY ${col} ${dir}`,
    values
  );
  res.json(result.rows);
});

app.post("/api/ratings", auth, allowRoles("NORMAL_USER"), async (req, res) => {
  const error = validateRating(req.body.rating);
  if (error) return res.status(400).json({ message: error });

  const store = await query("SELECT id FROM stores WHERE id=$1", [req.body.storeId]);
  if (!store.rows.length) return res.status(404).json({ message: "Store not found." });

  try {
    const result = await query(
      `INSERT INTO ratings(user_id,store_id,rating)
       VALUES($1,$2,$3)
       ON CONFLICT(user_id,store_id)
       DO UPDATE SET rating=EXCLUDED.rating, updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [req.user.id, req.body.storeId, Number(req.body.rating)]
    );
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Could not submit rating." });
  }
});

// ---------- STORE OWNER ----------
app.get("/api/owner/dashboard", auth, allowRoles("STORE_OWNER"), async (req, res) => {
  const storeResult = await query(
    `SELECT s.id,s.name,s.address,
      COALESCE(ROUND(AVG(r.rating)::numeric,2),0) AS average_rating
     FROM stores s
     LEFT JOIN ratings r ON r.store_id=s.id
     WHERE s.owner_id=$1
     GROUP BY s.id`,
    [req.user.id]
  );

  if (!storeResult.rows.length) {
    return res.json({ store: null, users: [] });
  }

  const store = storeResult.rows[0];
  const usersResult = await query(
    `SELECT u.id,u.name,u.email,u.address,r.rating,r.updated_at
     FROM ratings r
     JOIN users u ON u.id=r.user_id
     WHERE r.store_id=$1
     ORDER BY r.updated_at DESC`,
    [store.id]
  );

  res.json({ store, users: usersResult.rows });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  try {
    await query("SELECT 1");
    await ensureAdmin();
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (e) {
    console.error("Database connection failed:", e.message);
  }
});
