const crypto = require('node:crypto');

const COOKIE = {
	STATE: 'psn_oauth_state',
	VERIFIER: 'psn_oauth_verifier',
	REDIRECT: 'psn_oauth_redirect',
	BASE: 'psn_oauth_base'
};

function b64url(buf) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pkcePair() {
	const verifier = b64url(crypto.randomBytes(32));
	const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

function cookieAttr({ secure, maxAge }) {
	const p = ['Path=/', 'SameSite=Lax', 'HttpOnly'];
	if (secure) p.push('Secure');
	if (maxAge !== undefined) p.push(`Max-Age=${maxAge}`);
	return p.join('; ');
}

function originFromReq(req) {
	const host = req.headers['x-forwarded-host'] || req.headers.host || '';
	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const redirect_uri = `${proto}://${host}/callback.html`;
	return { proto, redirect_uri };
}

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET').end();
		return;
	}

	const clientId = process.env.PARASCENE_CLIENT_ID;
	const base = (process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');

	if (!clientId) {
		res.status(500).send('Set PARASCENE_CLIENT_ID in environment variables.');
		return;
	}

	const { proto, redirect_uri } = originFromReq(req);
	const secure = proto === 'https';
	const maxAge = 600;

	const state = b64url(crypto.randomBytes(16));
	const { verifier, challenge } = pkcePair();

	const cState = `${COOKIE.STATE}=${encodeURIComponent(state)}; ${cookieAttr({ secure, maxAge })}`;
	const cVer = `${COOKIE.VERIFIER}=${encodeURIComponent(verifier)}; ${cookieAttr({ secure, maxAge })}`;
	const cRedir = `${COOKIE.REDIRECT}=${encodeURIComponent(redirect_uri)}; ${cookieAttr({ secure, maxAge })}`;
	const cBase = `${COOKIE.BASE}=${encodeURIComponent(base)}; ${cookieAttr({ secure, maxAge })}`;

	res.setHeader('Set-Cookie', [cState, cVer, cRedir, cBase]);

	const u = new URL(`${base}/oauth/authorize`);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('client_id', clientId);
	u.searchParams.set('redirect_uri', redirect_uri);
	u.searchParams.set('state', state);
	u.searchParams.set('scope', 'openid profile');
	u.searchParams.set('code_challenge_method', 'S256');
	u.searchParams.set('code_challenge', challenge);

	res.status(302).setHeader('Location', u.toString()).end();
};
