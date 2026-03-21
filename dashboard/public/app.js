// ── State ──
let data = null;

// ── Loading animation (queued real progress via SSE) ──
const loadingBar = document.getElementById("loadingBar");
const loadingSub = document.querySelector(".loading-sub");
const STEP_DELAY = 350;
const REPLAY_DELAY = 80;
let progressQueue = [];
let isAnimating = false;
let pendingUpdate = null;
let loadingDone = false;

function showStep(step) {
  const pct = Math.round((step.done / step.total) * 100);
  loadingBar.style.width = pct + "%";
  const icon = step.status === "ok" ? "✓" : "✗";
  loadingSub.textContent = `${icon} ${step.source} (${step.done}/${step.total})`;
}

function drainQueue() {
  if (isAnimating) return;
  if (loadingDone) {
    if (pendingUpdate) {
      data = pendingUpdate;
      pendingUpdate = null;
      render(data);
    }
    return;
  }
  if (progressQueue.length === 0) {
    if (pendingUpdate) {
      data = pendingUpdate;
      pendingUpdate = null;
      render(data);
      hideLoading();
    }
    return;
  }
  isAnimating = true;
  const step = progressQueue.shift();
  showStep(step);
  const delay = pendingUpdate ? REPLAY_DELAY : STEP_DELAY;
  setTimeout(() => {
    isAnimating = false;
    drainQueue();
  }, delay);
}

// ── SSE ──
const evtSource = new EventSource("/events");
evtSource.onmessage = (e) => {
  if (e.data === "connected") return;
  try {
    const msg = JSON.parse(e.data);
    if (msg.type === "progress") {
      progressQueue.push(msg);
      drainQueue();
    }
    if (msg.type === "update") {
      pendingUpdate = msg.data;
      drainQueue();
    }
  } catch {
    /* ignore malformed messages */
  }
};
evtSource.onerror = () => {
  document.getElementById("statusDot").className = "status-dot";
  document.getElementById("statusText").textContent = "DISCONNECTED";
};

// Fallback: poll /api/data
async function fallbackFetch() {
  try {
    const res = await fetch("/api/data");
    if (res.ok) {
      const d = await res.json();
      if (!loadingDone) {
        const sources = d.sweep?.sources || [];
        sources.forEach((s, i) => {
          progressQueue.push({
            done: i + 1,
            total: sources.length,
            source: s.source,
            status: s.status,
          });
        });
      }
      pendingUpdate = d;
      drainQueue();
    }
  } catch {
    /* ignore */
  }
}
setTimeout(fallbackFetch, 8000);
setInterval(fallbackFetch, 60000);

function hideLoading() {
  loadingDone = true;
  loadingBar.style.width = "100%";
  loadingSub.textContent = "All sources loaded";
  setTimeout(
    () => document.getElementById("loading").classList.add("hidden"),
    500,
  );
}

// ── Theme Toggle ──
(function initTheme() {
  const saved = localStorage.getItem("ai-pulse-theme");
  if (saved === "light") document.documentElement.classList.add("light");
  const btn = document.getElementById("themeToggle");
  function updateIcon() {
    btn.textContent = document.documentElement.classList.contains("light")
      ? "🌙"
      : "☀️";
  }
  updateIcon();
  btn.addEventListener("click", () => {
    document.documentElement.classList.toggle("light");
    localStorage.setItem(
      "ai-pulse-theme",
      document.documentElement.classList.contains("light") ? "light" : "dark",
    );
    updateIcon();
  });
})();

// ── Helpers ──
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function badgeClass(cat) {
  const map = {
    news: "badge-news",
    research: "badge-research",
    models: "badge-model",
    community: "badge-community",
    code: "badge-code",
    products: "badge-products",
  };
  return map[cat] || "badge-news";
}

function sourceColor(name) {
  const map = {
    TechCrunch: "#0a0",
    "The Verge": "#f06",
    VentureBeat: "#06f",
    "Google News": "#fa0",
    "Hacker News": "#f60",
    Reddit: "#f40",
    ArXiv: "#b388ff",
    "Hugging Face": "#ffd21e",
    "GitHub Trending": "#448aff",
    "Product Hunt": "#da552f",
  };
  return map[name] || "#888";
}

function formatNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

// ── Main Render ──
function render(d) {
  if (!d?.sweep) return;
  const sweep = d.sweep;
  const sources = sweep.sources || [];

  document.getElementById("statusDot").className = "status-dot live";
  document.getElementById("statusText").textContent = "LIVE";
  document.getElementById("sweepTime").textContent = timeAgo(sweep.timestamp);
  document.getElementById("sourceCount").textContent =
    `${sweep.sourcesOk}/${sweep.sourcesTotal} sources`;

  renderTicker(sources);
  renderStats(sources);
  renderNews(sources);
  renderModels(sources);
  renderPapers(sources);
  renderGitHub(sources);
  renderReddit(sources);
  renderHN(sources);
  renderProductHunt(sources);
  renderAnalysis(d.analysis);
  renderIntegrity(sources);
}

// ── Periodic refresh of time-dependent UI ──
setInterval(() => {
  if (!data?.sweep) return;
  document.getElementById("sweepTime").textContent = timeAgo(
    data.sweep.timestamp,
  );
  renderStats(data.sweep.sources || []);
}, 30000);

// ── Stats Bar ──
function renderStats(sources) {
  document.getElementById("statsBar").style.display = "flex";

  let totalArticles = 0,
    totalModels = 0,
    totalPapers = 0,
    totalRepos = 0,
    totalStars = 0;
  const sourceCounts = {};
  const pipelines = {};
  const categories = {};
  let newestTime = 0;

  for (const s of sources) {
    if (s.status !== "ok") continue;
    const items = s.data?.items || [];
    const models = s.data?.models?.items || [];
    const name = s.source;

    if (name === "Hugging Face") {
      totalModels = models.length;
      for (const m of models) {
        const p = m.pipeline || "other";
        pipelines[p] = (pipelines[p] || 0) + 1;
      }
    } else if (name === "ArXiv") {
      totalPapers = items.length;
      for (const p of items) {
        for (const c of (p.categories || []).slice(0, 2)) {
          categories[c] = (categories[c] || 0) + 1;
        }
      }
    } else if (name === "GitHub Trending") {
      totalRepos = items.length;
      for (const r of items) totalStars += r.stars || 0;
    } else {
      totalArticles += items.length;
      sourceCounts[name] = items.length;
    }

    for (const item of [...items, ...models]) {
      const t = new Date(
        item.published || item.created || item.time || item.lastModified || 0,
      ).getTime();
      if (t > newestTime) newestTime = t;
    }
  }

  document.getElementById("statArticles").textContent = totalArticles;
  document.getElementById("statModels").textContent = totalModels;
  document.getElementById("statPapers").textContent = totalPapers;
  document.getElementById("statRepos").textContent = totalRepos;

  const topPipeline = Object.entries(pipelines).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("statTopPipeline").textContent = topPipeline
    ? `Top: ${topPipeline[0]}`
    : "—";

  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("statTopCat").textContent = topCat
    ? `Top: ${topCat[0]}`
    : "—";

  document.getElementById("statTotalStars").textContent =
    `★ ${formatNum(totalStars)} total`;

  const colors = {
    TechCrunch: "#0a0",
    "The Verge": "#f06",
    VentureBeat: "#06f",
    "Google News": "#fa0",
    Reddit: "#f40",
    "Hacker News": "#f60",
    "Product Hunt": "#da552f",
  };
  const maxCount = Math.max(...Object.values(sourceCounts), 1);
  const chartHtml = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => {
      const h = Math.max(4, Math.round((count / maxCount) * 32));
      const c = colors[name] || "#888";
      const abbrev = name
        .split(" ")
        .map((w) => w[0])
        .join("");
      return `<div class="mini-bar" style="height:${h}px;background:${c}" title="${name}: ${count}"><span class="mini-bar-label">${abbrev}</span></div>`;
    })
    .join("");
  document.getElementById("chartSources").innerHTML = chartHtml;

  const ageMins = newestTime
    ? Math.max(0, Math.round((Date.now() - newestTime) / 60000))
    : 999;
  const freshPct = Math.max(
    0,
    Math.min(100, Math.round(100 * (1 - ageMins / 1440))),
  );
  const freshColor =
    ageMins < 60
      ? "var(--green)"
      : ageMins < 360
        ? "var(--amber)"
        : "var(--red)";
  document.getElementById("freshnessRing").style.background =
    `conic-gradient(${freshColor} ${freshPct}%, var(--bg3) ${freshPct}%)`;
  document.getElementById("freshnessVal").textContent =
    ageMins < 60 ? `${ageMins}m` : `${Math.round(ageMins / 60)}h`;
  document.getElementById("freshnessSub").textContent =
    ageMins < 60 ? "Very fresh" : ageMins < 360 ? "Recent" : "Aging";
}

// ── Ticker ──
function renderTicker(sources) {
  const items = [];
  for (const s of sources) {
    if (s.status !== "ok") continue;
    const srcItems = s.data?.items || [];
    const cat = s.data?.category || "news";
    for (const item of srcItems.slice(0, 5)) {
      if (item.title) {
        items.push({
          title: item.title,
          source: s.source,
          cat,
          url: item.url || item.permalink || "#",
        });
      }
    }
  }
  const html = items
    .map(
      (i) =>
        `<span class="ticker-item"><span class="badge ${badgeClass(i.cat)}">${esc(i.source)}</span> <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a></span>`,
    )
    .join("");
  document.getElementById("ticker").innerHTML = html + html;
}

// ── AI News (Trending + Newest) ──
function renderNews(sources) {
  const excludeSources = new Set(["GitHub Trending"]);
  const allItems = [];
  for (const s of sources) {
    if (s.status !== "ok" || excludeSources.has(s.source)) continue;
    const items = s.data?.items || [];
    for (const item of items.slice(0, 10)) {
      allItems.push({
        ...item,
        _source: s.source,
        _score: item.score || item.stars || item.likes || 0,
        _comments: item.comments || item.descendants || 0,
      });
    }
  }

  // Trending: sort by engagement
  const trending = [...allItems]
    .filter((i) => i._score > 0 || i._comments > 0)
    .sort((a, b) => b._score + b._comments - (a._score + a._comments))
    .slice(0, 20);
  document.getElementById("trendingCount").textContent = trending.length;
  document.getElementById("trendingBody").innerHTML = trending
    .map((i) => {
      const articleUrl = i.permalink || i.url || "";
      const mainHref = i.hnLink || articleUrl;
      return `
    <div class="news-item">
      <div class="news-title"><a href="${esc(mainHref)}" target="_blank" rel="noopener">${esc(i.title || i.name)}</a></div>
      <div class="news-meta">
        <span class="news-source" style="background:${sourceColor(i._source)}22;color:${sourceColor(i._source)}">${esc(i._source)}</span>
        ${i._score ? `<span class="news-score">▲ ${formatNum(i._score)}</span>` : ""}
        ${i._comments ? `<span>💬 ${formatNum(i._comments)}</span>` : ""}
        <span>${timeAgo(i.published || i.created || i.time)}</span>
      </div>
    </div>
  `;
    })
    .join("");

  // Newest: sort by date
  const newest = [...allItems]
    .filter((i) => i.published || i.created || i.time)
    .sort(
      (a, b) =>
        new Date(b.published || b.created || b.time || 0) -
        new Date(a.published || a.created || a.time || 0),
    )
    .slice(0, 20);
  document.getElementById("newsCount").textContent = newest.length;
  document.getElementById("newsBody").innerHTML = newest
    .map((i) => {
      const articleUrl = i.permalink || i.url || "";
      const mainHref = i.hnLink || articleUrl;
      return `
    <div class="news-item">
      <div class="news-title"><a href="${esc(mainHref)}" target="_blank" rel="noopener">${esc(i.title || i.name)}</a></div>
      <div class="news-meta">
        <span class="news-source" style="background:${sourceColor(i._source)}22;color:${sourceColor(i._source)}">${esc(i._source)}</span>
        ${i.creator ? `<span>${esc(i.creator)}</span>` : ""}
        <span>${timeAgo(i.published || i.created || i.time)}</span>
      </div>
    </div>
  `;
    })
    .join("");
}

// ── Trending Models ──
function renderModels(sources) {
  const hf = sources.find(
    (s) => s.source === "Hugging Face" && s.status === "ok",
  );
  const models = hf?.data?.models?.items || [];
  document.getElementById("modelsCount").textContent = models.length;

  document.getElementById("modelsBody").innerHTML = models
    .slice(0, 15)
    .map(
      (m) => `
  <div class="model-card">
    <div class="model-name"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.id)}</a></div>
    <div class="model-stats">↓ ${formatNum(m.downloads)} &nbsp; ♥ ${formatNum(m.likes)} &nbsp; ${esc(m.pipeline)}</div>
    <div class="model-tags">${(m.tags || []).map((t) => `<span class="model-tag">${esc(t)}</span>`).join("")}</div>
  </div>
`,
    )
    .join("");
}

// ── ArXiv Papers ──
function renderPapers(sources) {
  const arxiv = sources.find((s) => s.source === "ArXiv" && s.status === "ok");
  const papers = arxiv?.data?.items || [];
  document.getElementById("papersCount").textContent = papers.length;

  document.getElementById("papersBody").innerHTML = papers
    .slice(0, 15)
    .map(
      (p) => `
  <div class="paper-card">
    <div class="paper-title"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
    <div class="paper-authors">${esc((p.authors || []).join(", "))}</div>
    <div class="paper-cats">${(p.categories || [])
      .slice(0, 3)
      .map((c) => `<span class="paper-cat">${esc(c)}</span>`)
      .join("")}</div>
  </div>
`,
    )
    .join("");
}

// ── GitHub Trending ──
function renderGitHub(sources) {
  const gh = sources.find(
    (s) => s.source === "GitHub Trending" && s.status === "ok",
  );
  const repos = gh?.data?.items || [];
  document.getElementById("reposCount").textContent = repos.length;

  document.getElementById("reposBody").innerHTML = repos
    .slice(0, 12)
    .map(
      (r) => `
  <div class="repo-card">
    <div class="repo-name"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></div>
    <div class="repo-desc">${esc(r.description)}</div>
    <div class="repo-stats">
      <span><span class="star-icon">★</span> ${formatNum(r.stars)}</span>
      <span>🍴 ${formatNum(r.forks)}</span>
      ${r.language ? `<span>${esc(r.language)}</span>` : ""}
    </div>
  </div>
`,
    )
    .join("");
}

// ── Reddit ──
function renderReddit(sources) {
  const reddit = sources.find(
    (s) => s.source === "Reddit" && s.status === "ok",
  );
  const posts = reddit?.data?.items || [];
  document.getElementById("redditCount").textContent = posts.length;

  document.getElementById("redditBody").innerHTML = posts
    .slice(0, 15)
    .map(
      (p) => `
  <div class="news-item">
    <div class="news-title"><a href="${esc(p.permalink || p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
    <div class="news-meta">
      <span class="news-source" style="background:#f4000022;color:#f40">r/${esc(p.subreddit)}</span>
      <span class="news-score">▲ ${formatNum(p.score)}</span>
      <span>💬 ${p.comments}</span>
      <span>${timeAgo(p.created)}</span>
      ${p.flair ? `<span style="color:var(--purple)">${esc(p.flair)}</span>` : ""}
    </div>
  </div>
`,
    )
    .join("");
}

// ── Hacker News ──
function renderHN(sources) {
  const hn = sources.find(
    (s) => s.source === "Hacker News" && s.status === "ok",
  );
  const stories = hn?.data?.items || [];
  document.getElementById("hnCount").textContent = stories.length;

  document.getElementById("hnBody").innerHTML = stories
    .slice(0, 15)
    .map(
      (s) => `
  <div class="news-item">
    <div class="news-title"><a href="${esc(s.hnLink)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
    <div class="news-meta">
      <span class="news-score">▲ ${s.score}</span>
      <span>💬 ${s.comments}</span>
      <span>${esc(s.author)}</span>
      <span>${timeAgo(s.time)}</span>
    </div>
  </div>
`,
    )
    .join("");
}

// ── Product Hunt ──
function renderProductHunt(sources) {
  const ph = sources.find(
    (s) => s.source === "Product Hunt" && s.status === "ok",
  );
  const items = ph?.data?.items || [];
  document.getElementById("phCount").textContent = items.length;

  document.getElementById("phBody").innerHTML = items
    .slice(0, 10)
    .map(
      (i) => `
  <div class="news-item">
    <div class="news-title"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a></div>
    <div class="news-meta">${esc(i.description)}</div>
    <div class="news-meta"><span>${timeAgo(i.published)}</span></div>
  </div>
`,
    )
    .join("");
}

// ── Analysis ──
function renderAnalysis(analysis) {
  const briefPanel = document.getElementById("analysisPanel");
  const radarPanel = document.getElementById("radarPanel");
  if (!analysis) {
    briefPanel.style.display = "none";
    radarPanel.style.display = "none";
    return;
  }
  briefPanel.style.display = "block";
  radarPanel.style.display = "block";

  let bHtml = "";
  if (analysis.summary) {
    bHtml += `<div class="analysis-summary">${esc(analysis.summary)}</div>`;
  }

  if (analysis.trends?.length) {
    bHtml += `<div class="section-label">Emerging Trends</div>`;
    bHtml += `<div style="margin-bottom:14px">${analysis.trends.map((t) => `<span class="trend-item">${esc(t)}</span>`).join("")}</div>`;
  }

  if (analysis.topStories?.length) {
    bHtml += `<div class="section-label">Top Stories</div>`;
    for (const s of analysis.topStories) {
      const imp = s.impact || "medium";
      const headlineText = esc(s.headline);
      const headline = s.url
        ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${headlineText}</a>`
        : headlineText;
      bHtml += `<div class="analysis-story">
        <div class="analysis-headline">
          <span class="impact-badge ${imp}">${imp}</span>
          ${headline}
        </div>
        <div class="analysis-significance">${esc(s.significance)} <span class="cat-tag">${esc(s.category)}</span></div>
      </div>`;
    }
  }
  document.getElementById("analysisBody").innerHTML = bHtml;

  let rHtml = "";
  if (analysis.modelRadar?.length) {
    rHtml += `<div class="section-label">Model Radar</div>`;
    const statusMeta = {
      released: {
        color: "var(--green)",
        bg: "rgba(0,230,118,.15)",
        label: "RELEASED",
      },
      announced: {
        color: "var(--amber)",
        bg: "rgba(255,193,7,.15)",
        label: "ANNOUNCED",
      },
      rumored: {
        color: "var(--pink)",
        bg: "rgba(255,128,171,.15)",
        label: "RUMORED",
      },
      "in-development": {
        color: "var(--blue)",
        bg: "rgba(68,138,255,.15)",
        label: "IN DEV",
      },
    };
    document.getElementById("radarCount").textContent =
      analysis.modelRadar.length + (analysis.signals?.length || 0);
    for (const m of analysis.modelRadar) {
      const meta = statusMeta[m.status] || statusMeta["in-development"];
      const nameText = esc(m.name);
      const nameHtml = m.url
        ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${nameText}</a>`
        : nameText;
      rHtml += `<div class="radar-card">
        <div class="radar-status" style="background:${meta.color};box-shadow:0 0 6px ${meta.color}"></div>
        <div class="radar-info">
          <div class="radar-name">${nameHtml}</div>
          <div class="radar-org">${esc(m.org)}</div>
          ${m.note ? `<div class="radar-note">${esc(m.note)}</div>` : ""}
        </div>
        <span class="radar-status-label" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
      </div>`;
    }
  }

  if (analysis.signals?.length) {
    rHtml += `<div class="section-label" style="margin-top:12px">Signals</div>`;
    for (const s of analysis.signals) {
      const conf = s.confidence || "low";
      const sigText = esc(s.signal);
      const sigContent = s.url
        ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${sigText}</a>`
        : sigText;
      rHtml += `<div class="signal-item">
        <span class="signal-conf conf-${conf}">${esc(conf)}</span>
        <div class="signal-text">${sigContent}<span class="signal-source">${esc(s.source)}</span></div>
      </div>`;
    }
  }
  document.getElementById("radarBody").innerHTML = rHtml;
}

// ── Source Integrity (modal) ──
let cachedSources = [];
function renderIntegrity(sources) {
  cachedSources = sources;
}

document.getElementById("sourceCount").addEventListener("click", () => {
  const modal = document.getElementById("sourceModal");
  if (cachedSources.length) {
    document.getElementById("sourceModalBody").innerHTML =
      `<div class="source-grid">${cachedSources
        .map(
          (s) =>
            `<div class="source-chip"><span class="dot ${s.status === "ok" ? "ok" : "err"}"></span>${esc(s.source)}</div>`,
        )
        .join("")}</div>`;
  }
  modal.classList.add("open");
});
document.getElementById("sourceModalClose").addEventListener("click", () => {
  document.getElementById("sourceModal").classList.remove("open");
});
document.getElementById("sourceModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});
