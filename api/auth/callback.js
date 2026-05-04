/**
 * OAuth redirect target: validate PKCE cookies, exchange code, set session, redirect home.
 * No static callback.html needed.
 */

const { packSession, setSessionHeader, sessionFromTokenResponse } = require('../lib/session');
const { COOKIE, parseCookies, clearPkceCookieLines } = require('../lib/oauth-cookies');

function absoluteRedirect(req, path) {
	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const host = req.headers['x-forwarded-host'] || req.headers.host || '';
	return `${proto}://${host}${path.startsWith('/') ? path : '/' + path}`;
}

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET').end();
		return;
	}

	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const secure = proto === 'https';
	const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
	const pathQuery = req.url || '/';
	const parsed = new URL(pathQuery, `http://${host}`);

	const apiKey = process.env.PARASCENE_API_KEY;
	const clientId = process.env.PARASCENE_CLIENT_ID;
	const defaultBase = (process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');

	const oauthError = parsed.searchParams.get('error');
	const code = (parsed.searchParams.get('code') || '').trim();
	const state = (parsed.searchParams.get('state') || '').trim();

	const goWithError = (key) => {
		const path = key ? `/?oauth_error=${encodeURIComponent(key)}` : '/';
		res.status(302);
		res.setHeader('Set-Cookie', clearPkceCookieLines(secure));
		res.setHeader('Location', absoluteRedirect(req, path));
		res.end();
	};

	if (oauthError) {
		goWithError(oauthError === 'access_denied' ? 'access_denied' : oauthError);
		return;
	}

	if (!code || !state) {
		goWithError('missing_code');
		return;
	}

	if (!apiKey || !clientId) {
		goWithError('server_misconfigured');
		return;
	}

	const cookies = parseCookies(req.headers.cookie);
	const stateCookie = cookies[COOKIE.STATE];
	const code_verifier = cookies[COOKIE.VERIFIER];
	const redirect_uri = cookies[COOKIE.REDIRECT];
	const baseCookie = cookies[COOKIE.BASE] || defaultBase;

	if (!stateCookie || !code_verifier || !redirect_uri) {
		goWithError('missing_oauth_session');
		return;
	}

	if (state !== stateCookie) {
		goWithError('state_mismatch');
		return;
	}

	const form = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: clientId,
		code,
		redirect_uri,
		code_verifier
	});

	const tokenRes = await fetch(`${defaultBase}/oauth/token`, {
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
		goWithError('token_exchange');
		return;
	}

	const baseNorm = baseCookie.replace(/\/$/, '');
	const sessPayload = sessionFromTokenResponse(data, baseNorm);
	const packed = packSession(sessPayload);
	const sessionLine = packed ? setSessionHeader(packed, secure, 60 * 60 * 24 * 14) : null;

	const cookiesOut = [...clearPkceCookieLines(secure)];
	if (sessionLine) cookiesOut.push(sessionLine);

	res.status(302);
	res.setHeader('Set-Cookie', cookiesOut);
	res.setHeader('Location', absoluteRedirect(req, '/'));
	res.end();
};
