// apis/sources/reddit.mjs — Reddit AI subreddits (no key needed for .json endpoint)
import { safeFetch } from "../utils/fetch.mjs";

const SUBREDDITS = [
  "MachineLearning",
  "artificial",
  "LocalLLaMA",
  "singularity",
];

export async function briefing() {
  const results = await Promise.allSettled(
    SUBREDDITS.map((sub) =>
      safeFetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
        timeout: 12000,
        headers: { "User-Agent": "AIPulse/1.0" },
      }),
    ),
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
