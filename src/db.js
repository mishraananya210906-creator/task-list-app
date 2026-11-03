// SQLite database layer (uses Node's built-in `node:sqlite` module, so no install needed).
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");

function openDatabase(file = process.env.DB_FILE || path.join(__dirname, "..", "data", "tasks.db")) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      completed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

// Convert a DB row to the JSON shape returned by the API.
const toTask = (row) =>
  row && {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

function createTaskRepository(db) {
  const q = {
    all: db.prepare("SELECT * FROM tasks ORDER BY completed ASC, id DESC"),
    active: db.prepare("SELECT * FROM tasks WHERE completed = 0 ORDER BY id DESC"),
    done: db.prepare("SELECT * FROM tasks WHERE completed = 1 ORDER BY id DESC"),
    get: db.prepare("SELECT * FROM tasks WHERE id = ?"),
    insert: db.prepare("INSERT INTO tasks (title, description) VALUES (?, ?)"),
    update: db.prepare(
      "UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = datetime('now') WHERE id = ?"
    ),
    remove: db.prepare("DELETE FROM tasks WHERE id = ?"),
  };

  return {
    list(status = "all") {
      const stmt = status === "active" ? q.active : status === "completed" ? q.done : q.all;
      return stmt.all().map(toTask);
    },
    get: (id) => toTask(q.get.get(id)),
    create({ title, description = "" }) {
      const { lastInsertRowid } = q.insert.run(title, description);
      return toTask(q.get.get(lastInsertRowid));
    },
    update(id, { title, description, completed }) {
      q.update.run(title, description, completed ? 1 : 0, id);
      return toTask(q.get.get(id));
    },
    remove: (id) => q.remove.run(id).changes > 0,
  };
}

module.exports = { openDatabase, createTaskRepository };
