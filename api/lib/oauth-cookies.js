/** Shared PKCE cookie names + parsing (auth/start, auth/callback). */

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

function clearCookieLine(name, secure) {
	const p = [`${name}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
	if (secure) p.push('Secure');
	return p.join('; ');
}

function clearPkceCookieLines(secure) {
	return [
		clearCookieLine(COOKIE.STATE, secure),
		clearCookieLine(COOKIE.VERIFIER, secure),
		clearCookieLine(COOKIE.REDIRECT, secure),
		clearCookieLine(COOKIE.BASE, secure)
	];
}

module.exports = {
	COOKIE,
	parseCookies,
	clearPkceCookieLines,
	clearCookieLine
};
