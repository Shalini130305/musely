// Vercel serverless handler for per-post link previews.
// Bots/crawlers receive Open Graph HTML; real browsers receive the SPA shell
// so client-side routing still renders the post page normally.

const API_BASE = (process.env.MUSELY_API_URL || 'https://musely-server.vercel.app/api').replace(/\/$/, '');
const BOT_PATTERN = /bot|crawler|spider|facebookexternalhit|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|snapchat|pinterest|embedly|quora|skypeuripreview|vkshare|redditbot|applebot/i;

export default async function handler(req: any, res: any) {
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
  const userAgent = String(req.headers?.['user-agent'] || '');

  const proto = (req.headers?.['x-forwarded-proto'] as string) || 'https';
  const host = req.headers?.host || 'musely-in.vercel.app';
  const origin = `${proto}://${host}`;

  // Browsers: serve the SPA shell so /post/:id renders with full functionality.
  if (!BOT_PATTERN.test(userAgent)) {
    try {
      const shell = await fetch(`${origin}/index.html`);
      const html = await shell.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Never let a CDN cache one variant and serve it to the other.
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'User-Agent');
      return res.status(200).send(html);
    } catch {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'User-Agent');
      return res.status(200).send('<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/" /></head><body>Opening MUSELY…</body></html>');
    }
  }

  if (!id) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send('Missing post id');
  }

  try {
    const upstream = await fetch(`${API_BASE}/posts/${encodeURIComponent(id)}/og`, {
      headers: { 'user-agent': userAgent },
    });
    const html = await upstream.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Crawler HTML must never be cached across user agents.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'User-Agent');
    return res.status(upstream.status).send(html);
  } catch {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'User-Agent');
    return res.status(200).send(
      '<!doctype html><html><head><meta charset="utf-8" /><title>MUSELY — India\'s Creative Network</title>' +
      '<meta property="og:site_name" content="MUSELY" /><meta property="og:title" content="MUSELY — India\'s Creative Network" />' +
      `<meta property="og:image" content="${origin}/og-image.png" /></head><body>Opening MUSELY…</body></html>`
    );
  }
}
