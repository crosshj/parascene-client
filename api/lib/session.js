const crypto = require('node:crypto');

const SESSION_NAME = 'psn_session';

function getSecret() {
	return process.env.PARASCENE_SESSION_SECRET || process.env.PARASCENE_API_KEY || '';
}

/**
 * @param {{ access_token: string, refresh_token: string, expires_at_ms: number, base_url: string }} payload
 */
function packSession(payload) {
	const secret = getSecret();
	if (!secret) return null;
	const json = JSON.stringify(payload);
	const body = Buffer.from(json, 'utf8').toString('base64url');
	const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
	return `${body}.${sig}`;
}

function unpackSession(raw) {
	const secret = getSecret();
	if (!raw || !secret) return null;
	const dot = raw.lastIndexOf('.');
	if (dot === -1) return null;
	const body = raw.slice(0, dot);
	const sig = raw.slice(dot + 1);
	const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
	const a = Buffer.from(sig, 'utf8');
	const b = Buffer.from(expected, 'utf8');
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
	try {
		const json = Buffer.from(body, 'base64url').toString('utf8');
		return JSON.parse(json);
	} catch {
		return null;
	}
}

function cookieAttrs({ secure, maxAge }) {
	const p = ['Path=/', 'SameSite=Lax', 'HttpOnly'];
	if (secure) p.push('Secure');
	if (maxAge !== undefined) p.push(`Max-Age=${maxAge}`);
	return p.join('; ');
}

function setSessionHeader(value, secure, maxAgeSec) {
	return `${SESSION_NAME}=${encodeURIComponent(value)}; ${cookieAttrs({ secure, maxAge: maxAgeSec })}`;
}

function clearSessionHeader(secure) {
	const p = [`${SESSION_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
	if (secure) p.push('Secure');
	return p.join('; ');
}

function sessionFromTokenResponse(data, baseUrl) {
	const expiresIn = Number(data.expires_in) || 900;
	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at_ms: Date.now() + expiresIn * 1000,
		base_url: baseUrl.replace(/\/$/, '')
	};
}

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

/** Resolve asset URLs from Parascene APIs against the site origin (handles root-relative paths). */
function absolutizeParasceneAssetUrl(value, origin) {
	if (!value || typeof value !== 'string') return value;
	const v = value.trim();
	if (/^https?:\/\//i.test(v)) return v;
	if (v.startsWith('//')) return `https:${v}`;
	const base = origin.replace(/\/$/, '');
	if (v.startsWith('/')) return base + v;
	return v;
}

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

/**
 * Validates session cookie, refreshes access token when needed (may Set-Cookie on `res`).
 * @returns {Promise<{ access_token: string; base: string; payload: object } | null>}
 */
async function resolveSessionAccess(req, res) {
	const apiKey = process.env.PARASCENE_API_KEY;
	const clientId = process.env.PARASCENE_CLIENT_ID;
	const defaultBase = (process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');
	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const secure = proto === 'https';

	const cookies = parseCookies(req.headers.cookie);
	const raw = cookies[SESSION_NAME];
	let payload = raw ? unpackSession(raw) : null;

	if (!payload || !payload.access_token) return null;

	const base = (payload.base_url || defaultBase).replace(/\/$/, '');

	const needsRefresh = Date.now() > payload.expires_at_ms - 120000;
	if (needsRefresh) {
		if (!apiKey || !clientId || !payload.refresh_token) {
			res.setHeader('Set-Cookie', clearSessionHeader(secure));
			return null;
		}
		const next = await refreshTokens(payload, apiKey, clientId, base);
		if (!next) {
			res.setHeader('Set-Cookie', clearSessionHeader(secure));
			return null;
		}
		payload = next;
		const packed = packSession(payload);
		if (packed) {
			res.setHeader('Set-Cookie', setSessionHeader(packed, secure, 60 * 60 * 24 * 14));
		}
	}

	return { access_token: payload.access_token, base, payload };
}

module.exports = {
	SESSION_NAME,
	getSecret,
	packSession,
	unpackSession,
	setSessionHeader,
	clearSessionHeader,
	sessionFromTokenResponse,
	parseCookies,
	absolutizeParasceneAssetUrl,
	resolveSessionAccess
};
