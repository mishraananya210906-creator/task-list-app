// Request handlers + validation for /api/tasks
const { HttpError } = require("./errors");

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 500;

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Task id must be a positive integer.");
  return id;
}

function cleanText(value, field, max, { required }) {
  if (value === undefined) {
    if (required) throw new HttpError(400, `"${field}" is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new HttpError(400, `"${field}" must be a string.`);
  const text = value.trim();
  if (required && !text) throw new HttpError(400, `"${field}" cannot be empty.`);
  if (text.length > max) throw new HttpError(400, `"${field}" must be at most ${max} characters.`);
  return text;
}

function createHandlers(repo) {
  const getOr404 = (id) => {
    const task = repo.get(id);
    if (!task) throw new HttpError(404, `Task ${id} not found.`);
    return task;
  };

  return {
    // GET /api/tasks?status=all|active|completed
    list({ query }) {
      const status = query.get("status") || "all";
      if (!["all", "active", "completed"].includes(status)) {
        throw new HttpError(400, 'status must be one of "all", "active" or "completed".');
      }
      return { status: 200, body: repo.list(status) };
    },

    // GET /api/tasks/:id
    get({ params }) {
      return { status: 200, body: getOr404(parseId(params.id)) };
    },

    // POST /api/tasks   { title, description? }
    create({ body }) {
      const title = cleanText(body.title, "title", MAX_TITLE, { required: true });
      const description = cleanText(body.description, "description", MAX_DESCRIPTION, { required: false });
      return { status: 201, body: repo.create({ title, description }) };
    },

    // PUT /api/tasks/:id   { title?, description?, completed? }  (only sent fields change)
    update({ params, body }) {
      const id = parseId(params.id);
      const current = getOr404(id);

      const title = cleanText(body.title, "title", MAX_TITLE, { required: false });
      const description = cleanText(body.description, "description", MAX_DESCRIPTION, { required: false });
      if (title === "") throw new HttpError(400, '"title" cannot be empty.');
      if (body.completed !== undefined && typeof body.completed !== "boolean") {
        throw new HttpError(400, '"completed" must be true or false.');
      }

      const updated = repo.update(id, {
        title: title ?? current.title,
        description: description ?? current.description,
        completed: body.completed ?? current.completed,
      });
      return { status: 200, body: updated };
    },

    // PATCH /api/tasks/:id/toggle   flips completed / incomplete
    toggle({ params }) {
      const id = parseId(params.id);
      const current = getOr404(id);
      return { status: 200, body: repo.update(id, { ...current, completed: !current.completed }) };
    },

    // DELETE /api/tasks/:id
    remove({ params }) {
      const id = parseId(params.id);
      getOr404(id);
      repo.remove(id);
      return { status: 204 };
    },
  };
}

module.exports = { createHandlers };
