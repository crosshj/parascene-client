# parascene-client

Minimal static HTML + Vercel functions: **Sign in with Parascene**, **signed HttpOnly session cookie**, **`GET /api/session`** (loads profile after refresh, refreshes tokens when needed), **`POST /api/logout`**.

Details: [Log in with Parascene](https://www.parascene.com/help/developer/login-with-parascene).

## Flow

1. **`GET /api/auth/start`** — PKCE + HttpOnly PKCE cookies → **302** to Parascene `/oauth/authorize`.
2. **`/callback.html`** — **`POST /api/exchange`** → clears PKCE cookies, sets **`psn_session`** (HMAC-signed; holds access + refresh tokens + expiry + base URL). Redirects **/**.
3. **`GET /api/session`** — Reads **`psn_session`**, verifies signature, refreshes access token with **`refresh_token`** when near expiry, returns **`userinfo`** from Parascene.
4. **`POST /api/logout`** — Clears **`psn_session`**.

The browser **never** sees raw tokens; only the server decodes the cookie (signature verified with `PARASCENE_SESSION_SECRET` or `PARASCENE_API_KEY`).

## Environment variables

- **`PARASCENE_API_KEY`** (required) — `psn_…`; token + refresh calls.
- **`PARASCENE_CLIENT_ID`** (required) — OAuth app id.
- **`PARASCENE_BASE_URL`** (optional) — default `https://www.parascene.com`.
- **`PARASCENE_SESSION_SECRET`** (optional) — HMAC key for session cookie; if omitted, **`PARASCENE_API_KEY`** is used (fine for demos).

## Parascene setup

Register redirect **`https://<project>.vercel.app/callback.html`** (and localhost for `vercel dev`).

## Deploy

```bash
vercel
```

```bash
vercel dev
```
