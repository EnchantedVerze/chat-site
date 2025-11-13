import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { initDB } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(express.static("views"));

const db = await initDB();

// Middleware for auth
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Register
app.post("/api/register", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.run(
      `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
      [username.toLowerCase(), email || null, hashed]
    );

    // Admin detection based on email
    if (
      email === "bvpstudios012@gmail.com" ||
      email === "enchantedverze@gmail.com"
    ) {
      await db.run(`UPDATE users SET role='admin' WHERE email=?`, [email]);
    }

    res.json({ message: "Account created successfully" });
  } catch (err) {
    res.status(400).json({ error: "Username or email already exists" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get(`SELECT * FROM users WHERE username=?`, [
    username.toLowerCase(),
  ]);
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Invalid password" });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
  res.json({ token });
});

// Change username
app.post("/api/change-username", auth, async (req, res) => {
  const { username } = req.body;
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username))
    return res.status(400).json({ error: "Invalid username" });
  try {
    await db.run(`UPDATE users SET username=? WHERE id=?`, [
      username.toLowerCase(),
      req.user.id,
    ]);
    res.json({ message: "Username updated" });
  } catch {
    res.status(400).json({ error: "Username taken" });
  }
});

// Post message (global chat)
app.post("/api/chat", auth, async (req, res) => {
  const text = req.body.text?.trim();
  if (!text) return res.status(400).json({ error: "Empty message" });
  await db.run(`INSERT INTO messages (user_id, text) VALUES (?, ?)`, [
    req.user.id,
    text,
  ]);
  res.json({ message: "Message sent" });
});

// Get latest messages
app.get("/api/chat", async (req, res) => {
  const msgs = await db.all(
    `SELECT messages.id, users.username, messages.text, messages.created_at
     FROM messages JOIN users ON users.id = messages.user_id
     ORDER BY messages.id DESC LIMIT 50`
  );
  res.json(msgs.reverse());
});

// Admin: delete user
app.delete("/api/users/:id", auth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Not allowed" });

  await db.run(`DELETE FROM users WHERE id=?`, [req.params.id]);
  res.json({ message: "User deleted" });
});

// Serve chat page
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/views/chat.html");
});

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
