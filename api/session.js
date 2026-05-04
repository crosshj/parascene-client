const {
	unpackSession,
	packSession,
	setSessionHeader,
	clearSessionHeader,
	parseCookies,
	SESSION_NAME
} = require('./lib/session');

async function refreshTokens(payload, apiKey, clientId, base) {
	const form = new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: clientId,
		refresh_token: payload.refresh_token
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
		return null;
	}
	if (!tokenRes.ok || !data.access_token) return null;
	const expiresIn = Number(data.expires_in) || 900;
	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token || payload.refresh_token,
		expires_at_ms: Date.now() + expiresIn * 1000,
		base_url: payload.base_url
	};
}

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET').json({ error: 'method_not_allowed' });
		return;
	}

	const apiKey = process.env.PARASCENE_API_KEY;
	const clientId = process.env.PARASCENE_CLIENT_ID;
	const defaultBase = (process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');

	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const secure = proto === 'https';

	const cookies = parseCookies(req.headers.cookie);
	const raw = cookies[SESSION_NAME];
	let payload = raw ? unpackSession(raw) : null;

	if (!payload || !payload.access_token) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false });
		return;
	}

	const base = (payload.base_url || defaultBase).replace(/\/$/, '');

	// Refresh if access token is expired or within 2 minutes of expiry
	const needsRefresh = Date.now() > payload.expires_at_ms - 120000;
	if (needsRefresh) {
		if (!apiKey || !clientId || !payload.refresh_token) {
			res.setHeader('Set-Cookie', clearSessionHeader(secure));
			res.setHeader('Cache-Control', 'no-store');
			res.status(200).json({ signed_in: false, reason: 'session_expired' });
			return;
		}
		const next = await refreshTokens(payload, apiKey, clientId, base);
		if (!next) {
			res.setHeader('Set-Cookie', clearSessionHeader(secure));
			res.setHeader('Cache-Control', 'no-store');
			res.status(200).json({ signed_in: false, reason: 'refresh_failed' });
			return;
		}
		payload = next;
		const packed = packSession(payload);
		if (packed) {
			res.setHeader('Set-Cookie', setSessionHeader(packed, secure, 60 * 60 * 24 * 14));
		}
	}

	let ui;
	try {
		ui = await fetch(`${base}/oauth/userinfo`, {
			headers: { Authorization: `Bearer ${payload.access_token}` }
		});
	} catch {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false, reason: 'userinfo_network_error' });
		return;
	}
	if (!ui.ok) {
		if (ui.status === 401 || ui.status === 403) {
			res.setHeader('Set-Cookie', clearSessionHeader(secure));
		}
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false, reason: 'userinfo_failed', status: ui.status });
		return;
	}
	let userinfo;
	try {
		userinfo = await ui.json();
	} catch {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false, reason: 'userinfo_parse_error' });
		return;
	}

	res.setHeader('Cache-Control', 'no-store');
	res.status(200).json({
		signed_in: true,
		userinfo,
		expires_at_ms: payload.expires_at_ms
	});
};
