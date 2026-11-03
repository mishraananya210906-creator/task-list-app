// Frontend logic: talks to the REST API with fetch() and renders the list.
const API = "/api/tasks";

const els = {
  form: document.getElementById("addForm"),
  title: document.getElementById("newTitle"),
  desc: document.getElementById("newDesc"),
  list: document.getElementById("taskList"),
  empty: document.getElementById("empty"),
  emptyText: document.getElementById("emptyText"),
  emptyImg: document.getElementById("emptyImg"),
  summary: document.getElementById("summary"),
  toasts: document.getElementById("toasts"),
  filters: document.querySelectorAll(".filter"),
};

let tasks = [];
let filter = "all";
let editingId = null;

// ---------- API helper ----------
async function api(path = "", options = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Is it running?");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Something went wrong.");
  return data;
}

// ---------- Toast feedback ----------
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ---------- Rendering ----------
function formatDate(iso) {
  // SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"
  const date = new Date(iso.replace(" ", "T") + "Z");
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function renderTask(task) {
  const li = el("li", { className: `task${task.completed ? " done" : ""}` });
  li.dataset.id = task.id;

  const checkbox = el("input", { type: "checkbox", checked: task.completed });
  checkbox.setAttribute("aria-label", `Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`);
  checkbox.addEventListener("change", () => toggleTask(task.id));
  li.appendChild(el("label", { className: "check" }, checkbox, el("span", { textContent: "✓" })));

  if (editingId === task.id) {
    const titleInput = el("input", { type: "text", value: task.title, maxLength: 120 });
    const descInput = el("input", { type: "text", value: task.description, maxLength: 500, placeholder: "Add a note (optional)" });
    titleInput.setAttribute("aria-label", "Edit title");
    descInput.setAttribute("aria-label", "Edit note");

    const save = el("button", { className: "btn btn-primary", type: "button", textContent: "Save" });
    const cancel = el("button", { className: "btn", type: "button", textContent: "Cancel" });
    const submit = () => saveEdit(task.id, titleInput.value, descInput.value);
    save.addEventListener("click", submit);
    cancel.addEventListener("click", () => { editingId = null; render(); });
    [titleInput, descInput].forEach((input) =>
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") { editingId = null; render(); }
      })
    );

    li.appendChild(el("div", { className: "edit-fields" }, titleInput, descInput, el("div", { className: "edit-actions" }, save, cancel)));
    setTimeout(() => titleInput.focus(), 0);
    return li;
  }

  const body = el("div", { className: "task-body" }, el("div", { className: "task-title", textContent: task.title }));
  if (task.description) body.appendChild(el("div", { className: "task-desc", textContent: task.description }));
  body.appendChild(el("div", { className: "task-meta", textContent: `Added ${formatDate(task.createdAt)}` }));
  li.appendChild(body);

  const editBtn = el("button", { className: "btn icon-btn", type: "button", textContent: "✎", title: "Edit task" });
  editBtn.setAttribute("aria-label", `Edit "${task.title}"`);
  editBtn.addEventListener("click", () => { editingId = task.id; render(); });

  const delBtn = el("button", { className: "btn btn-danger icon-btn", type: "button", textContent: "🗑", title: "Delete task" });
  delBtn.setAttribute("aria-label", `Delete "${task.title}"`);
  delBtn.addEventListener("click", () => deleteTask(task.id, li));

  li.appendChild(el("div", { className: "task-actions" }, editBtn, delBtn));
  return li;
}

function render() {
  const visible = tasks.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.completed : t.completed
  );

  els.list.replaceChildren(...visible.map(renderTask));

  const done = tasks.filter((t) => t.completed).length;
  els.summary.textContent = tasks.length
    ? `${done} of ${tasks.length} task${tasks.length === 1 ? "" : "s"} completed`
    : "Nothing here yet. Add your first task below.";

  // A different picture + message for each kind of empty list
  const emptyStates = {
    all: { img: "img/calendar.jpg", alt: "A hand pinning a note to a calendar", text: "No tasks yet. Add one above to get started! ✨" },
    active: { img: "img/nothing.jpg", alt: "A to-do list that says Nothing, crossed out", text: "Nothing left to do. Nice work! 🎉" },
    completed: { img: "img/study-cat.jpg", alt: "A cat wearing glasses next to a stack of books", text: "No completed tasks yet. Study hard! 📚" },
  };
  const state = emptyStates[filter];
  els.empty.hidden = visible.length > 0;
  els.emptyImg.src = state.img;
  els.emptyImg.alt = state.alt;
  els.emptyText.textContent = state.text;
}

function showSkeleton() {
  els.list.replaceChildren(...Array.from({ length: 3 }, () => el("li", { className: "skeleton" })));
  els.empty.hidden = true;
}

// ---------- Actions ----------
async function loadTasks() {
  showSkeleton();
  try {
    tasks = await api();
    render();
  } catch (err) {
    els.list.replaceChildren();
    els.summary.textContent = "Could not load tasks.";
    toast(err.message, "error");
  }
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return toast("Please enter a task title.", "error");

  const button = els.form.querySelector("button");
  button.disabled = true;
  try {
    const task = await api("", { method: "POST", body: JSON.stringify({ title, description: els.desc.value }) });
    tasks.unshift(task);
    els.form.reset();
    els.title.focus();
    render();
    toast("Task added");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    button.disabled = false;
  }
});

async function toggleTask(id) {
  try {
    const updated = await api(`/${id}/toggle`, { method: "PATCH" });
    tasks = tasks.map((t) => (t.id === id ? updated : t));
    render();
    toast(updated.completed ? "Marked as complete" : "Marked as incomplete");
  } catch (err) {
    toast(err.message, "error");
    loadTasks();
  }
}

async function saveEdit(id, title, description) {
  if (!title.trim()) return toast("Title cannot be empty.", "error");
  try {
    const updated = await api(`/${id}`, { method: "PUT", body: JSON.stringify({ title, description }) });
    tasks = tasks.map((t) => (t.id === id ? updated : t));
    editingId = null;
    render();
    toast("Task updated");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteTask(id, li) {
  try {
    await api(`/${id}`, { method: "DELETE" });
    li.classList.add("removing");
    setTimeout(() => {
      tasks = tasks.filter((t) => t.id !== id);
      render();
    }, 220);
    toast("Task deleted");
  } catch (err) {
    toast(err.message, "error");
    loadTasks();
  }
}

els.filters.forEach((btn) =>
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    els.filters.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active);
    });
    render();
  })
);

loadTasks();
