// apis/sources/github-trending.mjs — GitHub trending AI/ML repos (no key needed, token optional)
import { env } from "../utils/env.mjs";
import { safeFetch } from "../utils/fetch.mjs";

const AI_TOPICS = [
  "machine-learning",
  "deep-learning",
  "llm",
  "artificial-intelligence",
  "transformers",
  "generative-ai",
  "langchain",
];

export async function briefing() {
  const headers = {};
  const token = env("GITHUB_TOKEN");
  if (token) headers.Authorization = `token ${token}`;

  const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const query = `llm OR "large language model" OR "generative ai" language:python pushed:>${since}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`;

  let repos = [];
  try {
    const data = await safeFetch(url, { headers, timeout: 15000 });
    repos = (data.items || []).map((r) => ({
      name: r.full_name,
      description: (r.description || "").slice(0, 200),
      stars: r.stargazers_count,
      forks: r.forks_count,
      language: r.language,
      topics: (r.topics || []).slice(0, 5),
      created: r.created_at,
      url: r.html_url,
    }));
  } catch (err) {
    return {
      source: "GitHub Trending",
      category: "code",
      error: err.message,
      items: [],
    };
  }

  return {
    source: "GitHub Trending",
    category: "code",
    count: repos.length,
    items: repos,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}
