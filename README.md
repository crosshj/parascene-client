# parascene-client

Minimal static HTML + Vercel functions for **Sign in with Parascene** (OAuth + PKCE), token exchange with your **API key**, then **`GET /oauth/userinfo`**.

No framework. Official details: [Log in with Parascene](https://www.parascene.com/help/developer/login-with-parascene).

## Flow

1. User clicks **Sign in** → browser goes to **`GET /api/auth/start`** (same site).
2. That handler generates PKCE + `state`, stores **`code_verifier`**, **`redirect_uri`**, and Parascene **`base` URL** in **HttpOnly cookies**, then **302** to Parascene **`/oauth/authorize`** (using **`PARASCENE_CLIENT_ID`** from env only on the server).
3. After consent, Parascene redirects to **`/callback.html?code=…&state=…`**.
4. Callback **`POST /api/exchange`** with `{ code, state }` and **cookies** (`credentials: 'same-origin'`). Exchange verifies `state`, reads PKCE from cookies, calls Parascene **`POST /oauth/token`** with **`PARASCENE_API_KEY`**, clears cookies, returns tokens (+ `parascene_base_url` for the demo UI).

## Parascene setup

1. **Connections** (`/integrations`): **parascene API** key (`psn_…`).
2. **Apps you build**: register redirect URI exactly, e.g. `https://<project>.vercel.app/callback.html` and `http://localhost:3000/callback.html` for `vercel dev`.

## Vercel environment variables

- **`PARASCENE_API_KEY`** (required) — server-only; used in **`/api/exchange`**.
- **`PARASCENE_CLIENT_ID`** (required) — used in **`/api/auth/start`** and **`/api/exchange`**; never embedded in static HTML.
- **`PARASCENE_BASE_URL`** (optional) — defaults to `https://www.parascene.com`.

## Files

- `index.html` — link to `/api/auth/start`.
- `callback.html` — posts `{ code, state }` to `/api/exchange` with cookies.
- `api/auth/start.js` — PKCE + cookies + redirect to Parascene.
- `api/exchange.js` — token exchange + clear cookies.

## Deploy & local

```bash
vercel
```

```bash
vercel dev
```

Open the URL Vercel serves (not `file://`).
