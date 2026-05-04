const {
	absolutizeParasceneAssetUrl,
	clearSessionHeader,
	resolveSessionAccess
} = require('./lib/session');

function trunc(s, n) {
	if (s == null) return '';
	const t = String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
	if (t.length <= n) return t;
	return `${t.slice(0, n - 1).trim()}…`;
}

function mapFeedItem(item, base) {
	const root = base.replace(/\/$/, '');

	if (item.type === 'tip') {
		let tipHref = null;
		if (typeof item.ctaRoute === 'string' && item.ctaRoute.startsWith('/')) {
			tipHref = root + item.ctaRoute;
		}
		return {
			kind: 'tip',
			id: String(item.id),
			title: item.title || 'Tip',
			message: item.message || '',
			cta: item.cta || null,
			href: tipHref
		};
	}

	if (item.type === 'blog_post') {
		const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
		return {
			kind: 'blog',
			id: String(item.id),
			title: item.title || 'Blog post',
			summary: trunc(item.summary, 160),
			author: item.author || item.author_display_name || item.author_user_name || '',
			href: slug ? `${root}/blog/${encodeURIComponent(slug)}` : null,
			thumb: item.thumbnail_url ? absolutizeParasceneAssetUrl(item.thumbnail_url, root) : null
		};
	}

	const thumbRaw = item.thumbnail_url || item.image_url;
	const thumb = thumbRaw ? absolutizeParasceneAssetUrl(thumbRaw, root) : null;
	const cid = item.created_image_id != null ? Number(item.created_image_id) : null;
	return {
		kind: 'creation',
		id: String(item.id),
		title: item.title || 'Creation',
		summary: item.summary ? trunc(item.summary, 120) : '',
		author: item.author_display_name || item.author_user_name || item.author || '',
		href: Number.isFinite(cid) && cid > 0 ? `${root}/creations/${cid}` : null,
		thumb,
		like_count: Number(item.like_count) || 0,
		comment_count: Number(item.comment_count) || 0
	};
}

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.status(405).setHeader('Allow', 'GET').json({ error: 'method_not_allowed' });
		return;
	}

	const session = await resolveSessionAccess(req, res);
	if (!session) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(401).json({ error: 'unauthorized' });
		return;
	}

	const { access_token, base } = session;
	const root = base.replace(/\/$/, '');

	let feedRes;
	try {
		feedRes = await fetch(`${root}/api/feed?limit=8&offset=0`, {
			headers: { Authorization: `Bearer ${access_token}` }
		});
	} catch {
		res.setHeader('Cache-Control', 'no-store');
		res.status(502).json({ error: 'feed_network_error' });
		return;
	}

	if (feedRes.status === 401 || feedRes.status === 403) {
		const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
		const secure = proto === 'https';
		res.setHeader('Set-Cookie', clearSessionHeader(secure));
		res.setHeader('Cache-Control', 'no-store');
		res.status(401).json({ error: 'unauthorized' });
		return;
	}

	if (!feedRes.ok) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({
			ok: false,
			parascene_base_url: root,
			items: [],
			feed_status: feedRes.status
		});
		return;
	}

	let data;
	try {
		data = await feedRes.json();
	} catch {
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).json({ ok: false, parascene_base_url: root, items: [] });
		return;
	}

	const raw = Array.isArray(data.items) ? data.items : [];
	const items = raw.map((row) => mapFeedItem(row, root));

	res.setHeader('Cache-Control', 'no-store');
	res.status(200).json({
		ok: true,
		parascene_base_url: root,
		has_more: Boolean(data.hasMore),
		items
	});
};
