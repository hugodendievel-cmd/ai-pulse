// lib/delta/engine.mjs — Change tracking between sweeps
export function computeDelta(current, previous) {
  if (!previous) {
    return { isFirst: true, newItems: [], removedItems: [], changes: [] };
  }

  const delta = { isFirst: false, newItems: [], removedItems: [], changes: [] };
  const prevTitleSet = buildTitleSet(previous);
  const currTitleSet = buildTitleSet(current);

  // Find new items (in current but not previous)
  for (const src of current.sources) {
    if (src.status !== "ok") continue;
    const items = extractItems(src);
    for (const item of items) {
      const key = normalizeTitle(item.title || item.name || item.id || "");
      if (key && !prevTitleSet.has(key)) {
        delta.newItems.push({
          source: src.source,
          title: item.title || item.name || item.id,
          url: item.url || item.permalink || "",
          category: src.data?.category || "unknown",
        });
      }
    }
  }

  // Find removed items
  for (const src of previous.sources) {
    if (src.status !== "ok") continue;
    const items = extractItems(src);
    for (const item of items) {
      const key = normalizeTitle(item.title || item.name || item.id || "");
      if (key && !currTitleSet.has(key)) {
        delta.removedItems.push({
          source: src.source,
          title: item.title || item.name || item.id,
        });
      }
    }
  }

  // Track score changes (HN, Reddit)
  for (const src of current.sources) {
    if (src.status !== "ok") continue;
    const prevSrc = previous.sources.find(
      (p) => p.source === src.source && p.status === "ok",
    );
    if (!prevSrc) continue;

    const prevMap = buildScoreMap(prevSrc);
    const items = extractItems(src);
    for (const item of items) {
      const key = normalizeTitle(item.title || item.name || "");
      if (!key || !prevMap.has(key)) continue;
      const oldScore = prevMap.get(key);
      const newScore = item.score || item.stars || 0;
      if (newScore && oldScore && newScore > oldScore * 1.5) {
        delta.changes.push({
          source: src.source,
          title: item.title || item.name,
          type: "surge",
          oldValue: oldScore,
          newValue: newScore,
        });
      }
    }
  }

  delta.newItems = delta.newItems.slice(0, 30);
  delta.removedItems = delta.removedItems.slice(0, 20);
  delta.changes = delta.changes.slice(0, 15);

  return delta;
}

function extractItems(src) {
  if (src.data?.items) return src.data.items;
  if (src.data?.models?.items) return src.data.models.items;
  return [];
}

function normalizeTitle(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 80);
}

function buildTitleSet(sweep) {
  const set = new Set();
  for (const src of sweep.sources) {
    if (src.status !== "ok") continue;
    for (const item of extractItems(src)) {
      const key = normalizeTitle(item.title || item.name || item.id || "");
      if (key) set.add(key);
    }
  }
  return set;
}

function buildScoreMap(src) {
  const map = new Map();
  for (const item of extractItems(src)) {
    const key = normalizeTitle(item.title || item.name || "");
    const score = item.score || item.stars || 0;
    if (key && score) map.set(key, score);
  }
  return map;
}
