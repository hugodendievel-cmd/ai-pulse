// apis/sources/reddit.mjs — Reddit AI subreddits (OAuth when configured, public fallback)
import { safeFetch } from "../utils/fetch.mjs";

const SUBREDDITS = [
  "MachineLearning",
  "artificial",
  "LocalLLaMA",
  "singularity",
];

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

let oauthToken = null;
let tokenExpiry = 0;

async function getOAuthToken() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;
  if (oauthToken && Date.now() < tokenExpiry) return oauthToken;

  const credentials = Buffer.from(
    `${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AIPulse/1.0",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const data = await res.json();
  oauthToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return oauthToken;
}

export async function briefing() {
  const token = await getOAuthToken();
  const useOAuth = !!token;

  const results = await Promise.allSettled(
    SUBREDDITS.map((sub) => {
      const url = useOAuth
        ? `https://oauth.reddit.com/r/${sub}/hot?limit=15`
        : `https://www.reddit.com/r/${sub}/hot.json?limit=15`;
      const headers = useOAuth
        ? { Authorization: `Bearer ${token}`, "User-Agent": "AIPulse/1.0" }
        : { "User-Agent": "AIPulse/1.0" };
      return safeFetch(url, { timeout: 12000, headers });
    }),
  );

  const items = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const posts = r.value?.data?.children || [];
    for (const p of posts) {
      const d = p.data;
      if (d.stickied) continue;
      items.push({
        title: d.title,
        subreddit: SUBREDDITS[i],
        score: d.score,
        comments: d.num_comments,
        author: d.author,
        url: d.url,
        permalink: `https://reddit.com${d.permalink}`,
        created: new Date(d.created_utc * 1000).toISOString(),
        flair: d.link_flair_text || null,
      });
    }
  });

  items.sort((a, b) => b.score - a.score);

  return {
    source: "Reddit",
    category: "community",
    count: items.length,
    items: items.slice(0, 25),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}
