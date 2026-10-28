// Telegram notification hook. Env only: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// (TELEGRAM_CHAT_ID may be a comma-separated list, same convention as the DV routines).
// Never throws, never prints the token; silently no-ops when env is missing.
export async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!token || !chats.length) {
    console.log('  (telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — skipped)');
    return false;
  }
  let ok = true;
  for (const chat of chats) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        ok = false;
        console.error(`  (telegram: chat …${chat.slice(-4)} failed: ${j.description || res.status})`);
      }
    } catch (e) {
      ok = false;
      console.error(`  (telegram: ${e.message})`);
    }
  }
  return ok;
}
