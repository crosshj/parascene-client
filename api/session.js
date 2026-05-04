const {
	absolutizeParasceneAssetUrl,
	clearSessionHeader,
	resolveSessionAccess
} = require('./lib/session');

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET').json({ error: 'method_not_allowed' });
		return;
	}

	const session = await resolveSessionAccess(req, res);
	if (!session) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false });
		return;
	}

	const { access_token, base, payload } = session;

	let ui;
	try {
		ui = await fetch(`${base}/oauth/userinfo`, {
			headers: { Authorization: `Bearer ${access_token}` }
		});
	} catch {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ signed_in: false, reason: 'userinfo_network_error' });
		return;
	}
	if (!ui.ok) {
		if (ui.status === 401 || ui.status === 403) {
			const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
			const secure = proto === 'https';
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

	if (userinfo && typeof userinfo.picture === 'string') {
		userinfo = {
			...userinfo,
			picture: absolutizeParasceneAssetUrl(userinfo.picture, base)
		};
	}

	res.setHeader('Cache-Control', 'no-store');
	res.status(200).json({
		signed_in: true,
		userinfo,
		parascene_base_url: base,
		expires_at_ms: payload.expires_at_ms
	});
};
