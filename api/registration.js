import { DurableObject } from "cloudflare:workers";

const CONFERENCE = "iowa-2027";
const MAX_BODY_BYTES = 4096;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export class ConferenceRegistrations extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS registrations (
        email TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        university TEXT NOT NULL,
        registered_at TEXT NOT NULL
      )
    `);
  }

  list() {
    return this.sql.exec("SELECT name, university FROM registrations ORDER BY name, university").toArray();
  }

  register({ email, name, university }) {
    const inserted = this.sql.exec(`
      INSERT INTO registrations (email, name, university, registered_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO NOTHING
      RETURNING 1 AS inserted
    `, email, name, university, new Date().toISOString()).toArray();
    return inserted.length === 1;
  }
}

class RegistrationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanDisplayText(value, limit) {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/gu, " ");
  return text.length <= limit && !/[@\p{Cc}]/u.test(text) ? text : "";
}

async function readForm(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RegistrationError(415, "Send the registration details as JSON.");
  }
  if (!request.body) throw new RegistrationError(400, "Enter your registration details.");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    throw new RegistrationError(413, "The registration is too long.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RegistrationError(413, "The registration is too long.");
      }
      raw += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(raw + decoder.decode());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid form");
    return data;
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    throw new RegistrationError(400, "Enter valid registration details.");
  } finally {
    reader.releaseLock();
  }
}

async function matchesCode(provided, expected) {
  if (typeof provided !== "string" || provided.length > 80) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided.trim())),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

function responseHeaders(origin, allowedOrigin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Vary": "Origin",
  });
  if (origin === allowedOrigin) headers.set("Access-Control-Allow-Origin", allowedOrigin);
  return headers;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = responseHeaders(origin, env.SITE_ORIGIN);
    const json = (data, status = 200) => Response.json(data, { status, headers });
    const fail = (status, error) => json({ error }, status);

    if (pathname === "/register" && request.method === "OPTIONS" && origin === env.SITE_ORIGIN) {
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }

    try {
      if (pathname === "/attendees" && request.method === "GET") {
        const attendees = await env.REGISTRATIONS.getByName(CONFERENCE).list();
        return json({ attendees });
      }
      if (pathname !== "/register") return fail(404, "Not found.");
      if (origin !== env.SITE_ORIGIN) return fail(403, "Open the conference website to register.");
      if (request.method !== "POST") return fail(405, "Use the registration form to submit your details.");
      if (!env.REGISTRATION_CODE) return fail(503, "Registration is temporarily unavailable.");

      const result = await env.REGISTRATION_ATTEMPTS.limit({
        key: request.headers.get("CF-Connecting-IP") || "unavailable",
      });
      if (!result.success) {
        headers.set("Retry-After", "60");
        return fail(429, "Too many attempts. Wait a minute and try again.");
      }

      const data = await readForm(request);
      if (!await matchesCode(data.code, env.REGISTRATION_CODE)) {
        return fail(403, "That invitation code doesn’t match. Check your invitation and try again.");
      }
      const name = cleanDisplayText(data.name, 100);
      const university = cleanDisplayText(data.university, 140);
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      if (!name || !university || email.length > 254 || !EMAIL.test(email)) {
        return fail(422, "Enter your full name, university or affiliation, and a valid email address.");
      }

      const inserted = await env.REGISTRATIONS.getByName(CONFERENCE).register({ name, university, email });
      if (!inserted) {
        return fail(409, "This email address is already registered. Contact the organizer if you need to make a change.");
      }
      return json({ registered: true }, 201);
    } catch (error) {
      if (error instanceof RegistrationError) return fail(error.status, error.message);
      console.error(JSON.stringify({ event: "registration_service_error", operation: request.method }));
      return fail(503, "The registration service is temporarily unavailable. Please try again.");
    }
  },
};
