# Disaster Risk and Climate Finance Conference

[Conference website](https://cellis212.github.io/disaster-risk-2027/) · April 30–May 1, 2027 · Iowa City

GitHub Pages serves `docs/` from `main`. Edit `docs/index.html` for the program and hotel details. The form and public roster call the Cloudflare Worker defined in `api/registration.js`.

## Organizer access

The Worker checks the invitation code using the Cloudflare secret `REGISTRATION_CODE`. The public roster contains only names and affiliations. Full registrations are stored in the `registrations` table of the SQLite Durable Object named `iowa-2027`.

To view the private records, open [Durable Objects](https://dash.cloudflare.com/?to=/:account/workers/durable-objects) in the Cloudflare account that owns `disaster-risk-2027-registration`. Select its `ConferenceRegistrations` namespace, open **Data Studio**, and enter `iowa-2027` as the object name. Access requires editor privileges on the Worker. See [Cloudflare's Data Studio instructions](https://developers.cloudflare.com/durable-objects/observability/data-studio/).

## Local preview

1. Run `npm ci` and put `REGISTRATION_CODE=preview-only` in a local `.dev.vars` file. Use this test value only for local preview.
2. Run `npm run preview:api` and `npm run preview:site` in separate terminals.
3. Open `http://127.0.0.1:8765/`. Run `npm run check` for syntax checks and `npm run test:api` to exercise the local Worker. Test submissions stay in local Wrangler storage.

To redeploy an API change, use `npm run deploy:api -- --strict` while authenticated to the owning Cloudflare account. To change the conference code, enter it at the prompt for `npx wrangler secret put REGISTRATION_CODE`. Keep the code and any attendee exports out of Git.
