// Cloudflare Pages Function for per-post link previews.
// Bots/crawlers receive Open Graph HTML from the API; browsers receive the
// SPA shell from the static asset store so client routing keeps working.

const API_BASE = 'https://musely-server.vercel.app/api';
const BOT_PATTERN = /bot|crawler|spider|facebookexternalhit|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|snapchat|pinterest|embedly|quora|skypeuripreview|vkshare|redditbot|applebot/i;

export const onRequest = async (context: any) => {
  const { request, env, params } = context;
  const userAgent = request.headers.get('user-agent') || '';

  if (!BOT_PATTERN.test(userAgent)) {
    const shellUrl = new URL('/index.html', request.url);
    const shell = await env.ASSETS.fetch(new Request(shellUrl.toString(), { headers: request.headers }));
    return new Response(shell.body, {
      status: shell.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
        vary: 'user-agent',
      },
    });
  }

  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
  if (!id) {
    return new Response('Missing post id', { status: 400 });
  }

  try {
    const upstream = await fetch(`${API_BASE}/posts/${encodeURIComponent(id)}/og`, {
      headers: { 'user-agent': userAgent },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
        vary: 'user-agent',
      },
    });
  } catch {
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8" /><title>MUSELY</title>' +
        '<meta property="og:site_name" content="MUSELY" /></head><body>Opening MUSELY…</body></html>',
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', vary: 'user-agent' },
      }
    );
  }
};
