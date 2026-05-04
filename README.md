# parascene-client

Minimal static HTML + Vercel functions: **Sign in with Parascene**, **signed HttpOnly session cookie**, **`GET /api/session`**, **`GET /api/demo-feed`** (proxied `GET /api/feed` with your access token), **`POST /api/logout`**.

Details: [Log in with Parascene](https://www.parascene.com/help/developer/login-with-parascene).

## Flow

1. **`GET /api/auth/start`** — PKCE + HttpOnly PKCE cookies → **302** to Parascene `/oauth/authorize`.
2. **`GET /api/auth/callback`** — Parascene redirects here with `?code=` / `?error=`. This handler exchanges the code (server-side), clears PKCE cookies, sets **`psn_session`**, **302** to **`/`**. No static `callback.html`.
3. **`GET /api/session`** — Reads **`psn_session`**, refreshes access token when needed, returns **`userinfo`**.
4. **`GET /api/demo-feed`** — Uses the session access token to call Parascene **`GET /api/feed`** and returns a trimmed list for the demo UI (see **[API overview](https://www.parascene.com/help/developer/api)** — *Feed & discovery*).
5. **`POST /api/logout`** — Clears **`psn_session`**.

The browser **never** sees raw tokens; only the server decodes the cookie (signature verified with `PARASCENE_SESSION_SECRET` or `PARASCENE_API_KEY`).

## Environment variables

- **`PARASCENE_API_KEY`** (required) — `psn_…`; token + refresh calls.
- **`PARASCENE_CLIENT_ID`** (required) — OAuth app id.
- **`PARASCENE_BASE_URL`** (optional) — default `https://www.parascene.com`.
- **`PARASCENE_SESSION_SECRET`** (optional) — HMAC key for session cookie; if omitted, **`PARASCENE_API_KEY`** is used (fine for demos).

## Parascene setup

Register redirect **`https://<project>.vercel.app/api/auth/callback`** (and e.g. `http://localhost:3000/api/auth/callback` for `vercel dev`). Must match **exactly** what **`/api/auth/start`** sends (same origin + path).

**Avatars:** `GET /oauth/userinfo` may return a root-relative **`picture`**. This sample’s **`GET /api/session`** turns that into an absolute URL using **`PARASCENE_BASE_URL`**.

## Deploy

```bash
vercel
```

```bash
vercel dev
```
