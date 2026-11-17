const localPreview = location.origin === "http://127.0.0.1:8765";
const api = localPreview ? "http://127.0.0.1:8787" : "https://disaster-risk-2027-registration.cellis212.workers.dev";
const form = document.querySelector("#registration-form");
const fields = document.querySelector("#registration-fields");
const submit = form.querySelector("button[type='submit']");
const formStatus = document.querySelector("#registration-status");
const attendeeList = document.querySelector("#attendee-list");
const attendeeStatus = document.querySelector("#attendee-status");
const retry = document.querySelector("#attendee-retry");
const byName = new Intl.Collator("en", { sensitivity: "base" });

function message(text, kind = "") {
  formStatus.textContent = text;
  formStatus.dataset.kind = kind;
}

async function request(path, options = {}) {
  return fetch(`${api}${path}`, {
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    ...options,
  });
}

async function loadAttendees() {
  attendeeStatus.textContent = "Loading the attendee list…";
  retry.hidden = true;

  try {
    const response = await request("/attendees");
    if (!response.ok) throw new Error("Attendee list unavailable");
    const { attendees } = await response.json();
    const rows = attendees.sort((a, b) =>
      byName.compare(a.name, b.name) || byName.compare(a.university, b.university)
    ).map(({ name, university }) => {
      const row = document.createElement("li");
      const who = document.createElement("strong");
      const affiliation = document.createElement("span");
      who.textContent = name;
      affiliation.textContent = university;
      row.append(who, affiliation);
      return row;
    });
    attendeeList.replaceChildren(...rows);
    attendeeList.hidden = rows.length === 0;
    attendeeStatus.textContent = rows.length === 0
      ? "No attendees have registered yet."
      : `${rows.length} registered attendee${rows.length === 1 ? "" : "s"}`;
  } catch {
    attendeeStatus.textContent = "The attendee list is unavailable right now.";
    retry.hidden = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  const data = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  message("Submitting your registration…");

  try {
    const response = await request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      message(result.error || "Registration is unavailable. Please try again.", "error");
      if (response.status === 403) form.elements.code.focus();
      return;
    }

    form.reset();
    message("You’re registered. We’ll see you in Iowa City!", "success");
    await loadAttendees();
  } catch {
    message("We couldn’t confirm your registration. Please try again or contact the organizer.", "error");
  } finally {
    submit.disabled = false;
  }
});

fields.disabled = false;
retry.addEventListener("click", loadAttendees);
void loadAttendees();
