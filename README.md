# parascene-client

Minimal static HTML plus one Vercel API route: sign in with Parascene (OAuth + PKCE), exchange the code with your **Parascene API key** on the server, then call **`GET /oauth/userinfo`** with the access token.

No framework. Details: [Log in with Parascene](https://www.parascene.com/help/developer/login-with-parascene).

## Parascene setup

1. **Connections** (`/integrations`): generate a **parascene API** key (`psn_…`).
2. Under **Apps you build**, register an app. Add a redirect URI that matches this app exactly, e.g. `https://<project>.vercel.app/callback.html` and for `vercel dev` something like `http://localhost:3000/callback.html`.
3. Note the app’s public **`client_id`**.

## Vercel environment variables

Set these in the Vercel project (and in `.env.local` for `vercel dev`):

- **`PARASCENE_API_KEY`** — Your `psn_…` key. Used only inside **`/api/exchange`**. Never put this in HTML or client JS.
- **`PARASCENE_CLIENT_ID`** — The same public app id. The exchange route needs it on the server to call Parascene’s token endpoint.
- **`PARASCENE_BASE_URL`** (optional) — Defaults to `https://www.parascene.com`.

**Why is `client_id` also in `index.html`?**  
Static files are not processed by Node, so they cannot read Vercel env. The browser must send `client_id` on the redirect to `/oauth/authorize` anyway (it is public, not a secret). Use the **same** value as `PARASCENE_CLIENT_ID` in the dashboard: edit the `window.PSN_CLIENT_ID = '…'` line in `index.html` after deploy (or before).

## Files

- `index.html` — PKCE + redirect to Parascene (set `PSN_CLIENT_ID` here).
- `callback.html` — posts to `/api/exchange`, then calls `/oauth/userinfo`.
- `api/exchange.js` — server-only token exchange using `PARASCENE_API_KEY` + `PARASCENE_CLIENT_ID` from env.

## Deploy

```bash
vercel
```

## Local

```bash
vercel dev
```

Use the URL Vercel prints (not `file://`) so `/api/exchange` works.
