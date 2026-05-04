const { clearSessionHeader } = require('./lib/session');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST' && req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'method_not_allowed' });
		return;
	}

	const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
	const secure = proto === 'https';

	res.setHeader('Set-Cookie', clearSessionHeader(secure));
	res.setHeader('Cache-Control', 'no-store');
	res.status(200).json({ ok: true, signed_in: false });
};
