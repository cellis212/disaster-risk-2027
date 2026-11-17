import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const api = "http://127.0.0.1:8787";
const origin = "http://127.0.0.1:8765";

test("invitees can register once; the public roster omits their email and code", async () => {
  const code = "preview-only";
  const email = `check-${randomUUID()}@example.org`;
  const name = "Zoë Example";
  const university = "Example University";
  function register(data, requestOrigin = origin) {
    return fetch(`${api}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: requestOrigin },
      body: JSON.stringify(data),
    });
  }

  const preflight = await fetch(`${api}/register`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);

  assert.equal((await register({ name, university, email, code: "incorrect" })).status, 403);
  assert.equal((await register({ name, university, email, code }, "https://example.org")).status, 403);
  assert.equal((await register({ name, university, email: "invalid-address", code })).status, 422);

  const registered = await register({ name, university, email, code });
  assert.equal(registered.status, 201);
  assert.deepEqual(await registered.json(), { registered: true });
  assert.equal((await register({ name, university: "Different university", email: email.toUpperCase(), code })).status, 409);

  const publicList = await fetch(`${api}/attendees`);
  assert.equal(publicList.status, 200);
  const body = await publicList.text();
  assert.ok(!body.includes(email));
  assert.ok(!body.includes(code));
  const { attendees } = JSON.parse(body);
  assert.ok(attendees.some((entry) => entry.name === name && entry.university === university));
  assert.ok(attendees.every((entry) => Object.keys(entry).sort().join() === "name,university"));
});
