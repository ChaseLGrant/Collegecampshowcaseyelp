// Netlify Scheduled Function: the daily Camp Check refresh (was a Vercel Cron in vercel.json).
// Calls /api/cron/refresh on this site's primary URL with CRON_SECRET, same as Vercel Cron did.
// Note: Netlify scheduled functions run only on published production deploys, and the refresh
// route runs as a normal (synchronous) function, so a very long refresh could hit Netlify's
// function time limit; today it finishes in about a second.
export default async () => {
  const base = process.env.URL; // Netlify sets this to the site's primary URL
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("cron-refresh: URL or CRON_SECRET missing");
    return;
  }
  const res = await fetch(`${base}/api/cron/refresh`, { headers: { authorization: `Bearer ${secret}` } });
  const body = await res.text();
  console.log(`cron-refresh: ${res.status} ${body.slice(0, 500)}`);
};

export const config = { schedule: "17 6 * * *" };
