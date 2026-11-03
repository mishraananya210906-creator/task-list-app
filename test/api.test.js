// API tests using Node's built-in test runner:  npm test
const test = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../src/db");
const { createApp } = require("../src/server");

let server;
let base;

test.before(async () => {
  server = createApp(openDatabase(":memory:"));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}/api/tasks`;
});

test.after(() => server.close());

const call = async (path, method = "GET", body) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test("creates a task", async () => {
  const { status, body } = await call("", "POST", { title: "  Learn Kotlin  ", description: "Compose basics" });
  assert.equal(status, 201);
  assert.equal(body.title, "Learn Kotlin"); // trimmed
  assert.equal(body.completed, false);
  assert.ok(body.id);
});

test("rejects invalid input with 400", async () => {
  assert.equal((await call("", "POST", {})).status, 400);
  assert.equal((await call("", "POST", { title: "   " })).status, 400);
  assert.equal((await call("", "POST", { title: 42 })).status, 400);
  assert.equal((await call("", "POST", { title: "x".repeat(121) })).status, 400);
  assert.equal((await call("", "POST", "{not json")).status, 400);
});

test("lists and filters tasks", async () => {
  const a = (await call("", "POST", { title: "Active one" })).body;
  const b = (await call("", "POST", { title: "Done one" })).body;
  await call(`/${b.id}/toggle`, "PATCH");

  const all = (await call("")).body;
  assert.ok(all.length >= 2);
  assert.ok((await call("?status=active")).body.every((t) => !t.completed));
  assert.ok((await call("?status=completed")).body.every((t) => t.completed));
  assert.equal((await call("?status=nope")).status, 400);
  assert.ok(all.some((t) => t.id === a.id));
});

test("gets one task and returns 404 for missing", async () => {
  const created = (await call("", "POST", { title: "Find me" })).body;
  assert.equal((await call(`/${created.id}`)).body.title, "Find me");
  assert.equal((await call("/99999")).status, 404);
  assert.equal((await call("/abc")).status, 400);
});

test("edits a task (only sent fields change)", async () => {
  const created = (await call("", "POST", { title: "Old", description: "keep me" })).body;
  const { status, body } = await call(`/${created.id}`, "PUT", { title: "New" });
  assert.equal(status, 200);
  assert.equal(body.title, "New");
  assert.equal(body.description, "keep me");

  assert.equal((await call(`/${created.id}`, "PUT", { title: "" })).status, 400);
  assert.equal((await call(`/${created.id}`, "PUT", { completed: "yes" })).status, 400);
  assert.equal((await call("/99999", "PUT", { title: "x" })).status, 404);
});

test("marks complete / incomplete", async () => {
  const created = (await call("", "POST", { title: "Toggle me" })).body;
  assert.equal((await call(`/${created.id}/toggle`, "PATCH")).body.completed, true);
  assert.equal((await call(`/${created.id}/toggle`, "PATCH")).body.completed, false);
  assert.equal((await call(`/${created.id}`, "PUT", { completed: true })).body.completed, true);
});

test("deletes a task", async () => {
  const created = (await call("", "POST", { title: "Delete me" })).body;
  assert.equal((await call(`/${created.id}`, "DELETE")).status, 204);
  assert.equal((await call(`/${created.id}`)).status, 404);
  assert.equal((await call(`/${created.id}`, "DELETE")).status, 404);
});

test("unknown routes and methods return JSON errors", async () => {
  assert.equal((await call("/1/nothing")).status, 404);
  assert.equal((await call("", "DELETE")).status, 405);
});
