/**
 * Server-only: exchange OAuth code using API key + PKCE verifier from HttpOnly cookies.
 */

const { packSession, setSessionHeader, sessionFromTokenResponse } = require('./lib/session');

const COOKIE = {
	STATE: 'psn_oauth_state',
	VERIFIER: 'psn_oauth_verifier',
	REDIRECT: 'psn_oauth_redirect',
	BASE: 'psn_oauth_base'
};

function parseCookies(header) {
	const out = {};
	if (!header || typeof header !== 'string') return out;
	for (const part of header.split(';')) {
		const i = part.indexOf('=');
		if (i === -1) continue;
		const k = part.slice(0, i).trim();
		const v = decodeURIComponent(part.slice(i + 1).trim());
		out[k] = v;
	}
	return out;
}

function clearCookie(name, secure) {
	const p = [`${name}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
	if (secure) p.push('Secure');
	return p.join('; ');
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.status(405).setHeader('Allow', 'POST').json({ error: 'method_not_allowed' });
		return;
	}

	const apiKey = process.env.PARASCENE_API_KEY;
	const clientId = process.env.PARASCENE_CLIENT_ID;
	const base =
		(process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');

	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const secure = proto === 'https';

	const clearAll = (sessionCookieLine) => {
		const list = [
			clearCookie(COOKIE.STATE, secure),
			clearCookie(COOKIE.VERIFIER, secure),
			clearCookie(COOKIE.REDIRECT, secure),
			clearCookie(COOKIE.BASE, secure)
		];
		if (sessionCookieLine) list.push(sessionCookieLine);
		res.setHeader('Set-Cookie', list);
	};

	if (!apiKey || !clientId) {
		clearAll();
		res.status(500).json({ error: 'server_misconfigured', hint: 'Set PARASCENE_API_KEY and PARASCENE_CLIENT_ID' });
		return;
	}

	let body;
	try {
		body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
	} catch {
		clearAll();
		res.status(400).json({ error: 'invalid_json' });
		return;
	}

	const code = typeof body.code === 'string' ? body.code.trim() : '';
	const stateBody = typeof body.state === 'string' ? body.state.trim() : '';

	if (!code || !stateBody) {
		clearAll();
		res.status(400).json({ error: 'missing_fields', need: ['code', 'state'] });
		return;
	}

	const cookies = parseCookies(req.headers.cookie);
	const stateCookie = cookies[COOKIE.STATE];
	const code_verifier = cookies[COOKIE.VERIFIER];
	const redirect_uri = cookies[COOKIE.REDIRECT];
	const baseCookie = cookies[COOKIE.BASE] || base;

	if (!stateCookie || !code_verifier || !redirect_uri) {
		clearAll();
		res.status(400).json({
			error: 'missing_oauth_session',
			error_description: 'Start sign-in from this site (GET /api/auth/start) so PKCE cookies are set.'
		});
		return;
	}

	if (stateBody !== stateCookie) {
		clearAll();
		res.status(400).json({ error: 'state_mismatch' });
		return;
	}

	const form = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: clientId,
		code,
		redirect_uri,
		code_verifier
	});

	const tokenRes = await fetch(`${base}/oauth/token`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: form.toString()
	});

	const text = await tokenRes.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = { raw: text };
	}

	if (!tokenRes.ok) {
		clearAll();
		res.status(tokenRes.status).json(data);
		return;
	}

	const baseNorm = baseCookie.replace(/\/$/, '');
	const sessPayload = sessionFromTokenResponse(data, baseNorm);
	const packed = packSession(sessPayload);
	const sessionLine = packed ? setSessionHeader(packed, secure, 60 * 60 * 24 * 14) : null;

	clearAll(sessionLine);

	data.parascene_base_url = baseNorm;
	data.signed_in = true;
	res.status(200).json(data);
};
