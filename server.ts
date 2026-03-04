import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("vocab.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    phonetic TEXT,
    pos TEXT,
    definition TEXT,
    example TEXT,
    example_translation TEXT,
    example_segments TEXT,
    category TEXT DEFAULT '未分類',
    error_count INTEGER DEFAULT 0,
    user_id INTEGER DEFAULT 1,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add columns if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(words)").all() as { name: string }[];
const addColumn = (table: string, col: string, type: string) => {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!info.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
};

addColumn('words', 'pos', 'TEXT');
addColumn('words', 'user_id', 'INTEGER DEFAULT 1');
addColumn('words', 'deleted_at', 'DATETIME DEFAULT NULL');
addColumn('categories', 'user_id', 'INTEGER DEFAULT 1');
addColumn('users', 'avatar', 'TEXT');

// Ensure at least one user exists
const defaultUser = db.prepare("SELECT * FROM users WHERE id = 1").get();
if (!defaultUser) {
  db.prepare("INSERT INTO users (id, username, avatar) VALUES (1, '預設使用者', 'https://picsum.photos/seed/user1/100/100')").run();
}

// Initial category sync: Add existing categories from words table to categories table
const existingCategories = db.prepare("SELECT DISTINCT category, user_id FROM words WHERE category != '未分類'").all() as { category: string, user_id: number }[];
const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, user_id) VALUES (?, ?)");
existingCategories.forEach(c => insertCat.run(c.category, c.user_id || 1));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // User Routes
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    const { username, avatar } = req.body;
    if (!username) return res.status(400).json({ error: "Username required" });
    try {
      const userAvatar = avatar || `https://picsum.photos/seed/${username}/100/100`;
      const result = db.prepare("INSERT INTO users (username, avatar) VALUES (?, ?)").run(username, userAvatar);
      res.json({ id: result.lastInsertRowid, username, avatar: userAvatar });
    } catch (e) {
      res.status(400).json({ error: "User already exists" });
    }
  });

  // API Routes
  app.get("/api/words", (req, res) => {
    const { category, user_id = 1 } = req.query;
    let words;
    if (category && category !== '全部') {
      words = db.prepare("SELECT * FROM words WHERE category = ? AND user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(category, user_id);
    } else {
      words = db.prepare("SELECT * FROM words WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(user_id);
    }
    res.json(words.map((w: any) => ({
      ...w,
      example_segments: w.example_segments ? JSON.parse(w.example_segments) : []
    })));
  });

  app.get("/api/words/trash", (req, res) => {
    const { user_id = 1 } = req.query;
    const words = db.prepare("SELECT * FROM words WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(user_id);
    res.json(words.map((w: any) => ({
      ...w,
      example_segments: w.example_segments ? JSON.parse(w.example_segments) : []
    })));
  });

  app.post("/api/words/:id/restore", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE words SET deleted_at = NULL WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.delete("/api/words/:id/permanent", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM words WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/categories", (req, res) => {
    const { user_id = 1 } = req.query;
    const categories = db.prepare("SELECT name FROM categories WHERE user_id = ? ORDER BY name ASC").all(user_id) as { name: string }[];
    res.json(categories.map(c => c.name));
  });

  app.post("/api/categories", (req, res) => {
    const { name, user_id = 1 } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    try {
      db.prepare("INSERT INTO categories (name, user_id) VALUES (?, ?)").run(name, user_id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Category already exists" });
    }
  });

  app.put("/api/categories/:oldName", (req, res) => {
    const { newName, user_id = 1 } = req.body;
    const { oldName } = req.params;
    if (!newName) return res.status(400).json({ error: "New name required" });

    db.transaction(() => {
      db.prepare("UPDATE categories SET name = ? WHERE name = ? AND user_id = ?").run(newName, oldName, user_id);
      db.prepare("UPDATE words SET category = ? WHERE category = ? AND user_id = ?").run(newName, oldName, user_id);
    })();
    res.json({ success: true });
  });

  app.delete("/api/categories/:name", (req, res) => {
    const { name } = req.params;
    const { user_id = 1 } = req.query;
    db.transaction(() => {
      db.prepare("DELETE FROM categories WHERE name = ? AND user_id = ?").run(name, user_id);
      db.prepare("UPDATE words SET category = '未分類' WHERE category = ? AND user_id = ?").run(name, user_id);
    })();
    res.json({ success: true });
  });

  app.get("/api/export", (req, res) => {
    const { category, user_id = 1 } = req.query;
    let words;
    if (category && category !== '全部') {
      words = db.prepare("SELECT word, pos, phonetic, definition, example, category FROM words WHERE category = ? AND user_id = ? AND deleted_at IS NULL").all(category, user_id);
    } else {
      words = db.prepare("SELECT word, pos, phonetic, definition, example, category FROM words WHERE user_id = ? AND deleted_at IS NULL").all(user_id);
    }

    // Simple CSV generation
    const header = "Word,POS,Phonetic,Definition,Example,Category\n";
    const rows = words.map(w => {
      const escape = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
      return `${escape(w.word)},${escape(w.pos)},${escape(w.phonetic)},${escape(w.definition)},${escape(w.example)},${escape(w.category)}`;
    }).join("\n");

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vocab_list.csv');
    res.send(header + rows);
  });

  app.post("/api/words", (req, res) => {
    const { words, category, user_id = 1 } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const insert = db.prepare("INSERT INTO words (word, pos, phonetic, definition, example, example_translation, example_segments, category, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertMany = db.transaction((words, cat, uid) => {
      for (const w of words) {
        insert.run(
          w.word,
          w.pos || '',
          w.phonetic,
          w.definition,
          w.example,
          w.example_translation,
          JSON.stringify(w.example_segments || []),
          cat || '未分類',
          uid
        );
      }
    });

    insertMany(words, category, user_id);
    res.json({ success: true });
  });

  app.put("/api/words/bulk-category", (req, res) => {
    const { ids, category, user_id = 1 } = req.body;
    if (!Array.isArray(ids) || !category) {
      return res.status(400).json({ error: "Invalid data" });
    }
    const stmt = db.prepare("UPDATE words SET category = ? WHERE id = ? AND user_id = ?");
    const updateMany = db.transaction((ids, cat, uid) => {
      for (const id of ids) {
        stmt.run(cat, id, uid);
      }
    });
    updateMany(ids, category, user_id);
    res.json({ success: true });
  });

  app.delete("/api/words/:id", (req, res) => {
    db.prepare("UPDATE words SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/words/:id/category", (req, res) => {
    const { category } = req.body;
    const { id } = req.params;
    db.prepare("UPDATE words SET category = ? WHERE id = ?").run(category, id);
    res.json({ success: true });
  });

  app.post("/api/words/:id/error", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE words SET error_count = error_count + 1 WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/words/difficult", (req, res) => {
    const { user_id = 1 } = req.query;
    const words = db.prepare("SELECT * FROM words WHERE error_count > 0 AND user_id = ? AND deleted_at IS NULL ORDER BY error_count DESC LIMIT 20").all(user_id);
    res.json(words.map((w: any) => ({
      ...w,
      example_segments: w.example_segments ? JSON.parse(w.example_segments) : []
    })));
  });

  app.get("/api/stats", (req, res) => {
    const { user_id = 1 } = req.query;
    const total = db.prepare("SELECT COUNT(*) as count FROM words WHERE user_id = ? AND deleted_at IS NULL").get(user_id) as { count: number };
    const byCategory = db.prepare("SELECT category, COUNT(*) as count FROM words WHERE user_id = ? AND deleted_at IS NULL GROUP BY category").all(user_id) as { category: string, count: number }[];
    res.json({
      total: total.count,
      byCategory: byCategory.reduce((acc: any, curr) => {
        acc[curr.category] = curr.count;
        return acc;
      }, {})
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
