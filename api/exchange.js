/**
 * Server-only: exchange OAuth code for tokens using your Parascene API key.
 * Never expose PARASCENE_API_KEY to the browser.
 */

export default async function handler(req, res) {
	if (req.method !== 'POST') {
		res.status(405).setHeader('Allow', 'POST').json({ error: 'method_not_allowed' });
		return;
	}

	const apiKey = process.env.PARASCENE_API_KEY;
	const clientId = process.env.PARASCENE_CLIENT_ID;
	const base =
		(process.env.PARASCENE_BASE_URL || 'https://www.parascene.com').replace(/\/$/, '');

	if (!apiKey || !clientId) {
		res.status(500).json({ error: 'server_misconfigured', hint: 'Set PARASCENE_API_KEY and PARASCENE_CLIENT_ID' });
		return;
	}

	let body;
	try {
		body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
	} catch {
		res.status(400).json({ error: 'invalid_json' });
		return;
	}

	const code = typeof body.code === 'string' ? body.code.trim() : '';
	const redirect_uri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
	const code_verifier = typeof body.code_verifier === 'string' ? body.code_verifier.trim() : '';

	if (!code || !redirect_uri || !code_verifier) {
		res.status(400).json({ error: 'missing_fields', need: ['code', 'redirect_uri', 'code_verifier'] });
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
		res.status(tokenRes.status).json(data);
		return;
	}

	res.status(200).json(data);
}
