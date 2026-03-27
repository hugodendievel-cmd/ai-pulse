// lib/llm/weekly-digest.mjs — AI-powered weekly digest generation

const WEEKLY_SYSTEM_PROMPT = `You are an AI industry intelligence analyst producing a weekly digest for a team of AI engineers. This digest is used every Friday for team briefings.

CRITICAL RULES:
- ONLY use information from the source data provided below. Do NOT add anything from your training data.
- Every item you mention MUST come directly from the provided source list.
- If a source item looks older than 7 days based on its date, skip it.
- If there isn't enough recent data for a section, include fewer items. Never pad with old or made-up content.
- Prefer items that were published or updated within the last 7 days.

Your output MUST be valid JSON with this structure:
{
  "weekOf": "March 17–21, 2026",
  "tldr": "3-4 sentence executive summary of the most important AI developments this week",
  "highlights": [
    {
      "title": "Clear headline for this highlight",
      "body": "2-3 sentences explaining the development and why it matters for AI engineers",
      "category": "model-release|research|product|funding|regulation|open-source|infrastructure",
      "impact": "high|medium|low",
      "url": "source URL if available, or empty string"
    }
  ],
  "modelUpdates": [
    {
      "name": "Model or tool name",
      "org": "Organization",
      "summary": "One sentence about what happened",
      "url": "URL if available, or empty string"
    }
  ],
  "paperPicks": [
    {
      "title": "Paper title",
      "authors": "First author et al.",
      "insight": "One sentence on the key finding or contribution",
      "url": "URL if available, or empty string"
    }
  ],
  "communityBuzz": [
    "Short bullet about what the community is talking about",
    "Another community talking point"
  ],
  "lookAhead": "1-2 sentences about what to watch for next week based on the trends in the data"
}

Guidelines:
- Focus on what matters to AI ENGINEERS: new models, libraries, frameworks, breakthroughs, significant open-source releases
- Limit highlights to 5-7 most important items
- Limit modelUpdates to 3-5 entries
- Limit paperPicks to 3-4 top papers
- Limit communityBuzz to 4-6 bullet points
- Be concrete and specific, not vague
- Include URLs when available from the provided data
- Write in a clear, professional tone suitable for a Friday team digest`;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(dateStr) {
  if (!dateStr) return true; // keep items without dates (trending/hot feeds)
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts < SEVEN_DAYS_MS;
}

function formatItem(item) {
  const title = item.title || item.name || item.id || "";
  if (!title) return null;
  const date = item.published || item.lastModified || item.created || "";
  if (!isRecent(date)) return null;
  const url = item.url || item.permalink || item.hnLink || "";
  const datePart = date
    ? ` [${new Date(date).toISOString().split("T")[0]}]`
    : "";
  return {
    key: title.toLowerCase(),
    text: url ? `${title}${datePart} | ${url}` : `${title}${datePart}`,
  };
}

function collectSourceItems(sweep, seen, sourceMap) {
  for (const s of sweep.sources || []) {
    if (s.status !== "ok") continue;
    const name = s.source;
    if (!sourceMap[name]) sourceMap[name] = [];

    const items = s.data?.items || [];
    const models = s.data?.models?.items || [];

    for (const item of [...items, ...models]) {
      const entry = formatItem(item);
      if (!entry || seen.has(entry.key)) continue;
      seen.add(entry.key);
      sourceMap[name].push(entry.text);
    }
  }
}

/**
 * Generate a weekly digest from a dedicated 7-day sweep.
 * @param {object} llm       – LLM provider instance
 * @param {object} sweepData – Single sweep result from runDigestSweep()
 * @returns {Promise<object|null>}
 */
export async function generateWeeklyDigest(llm, sweepData) {
  if (!llm || !sweepData) return null;

  const seen = new Set();
  const sourceMap = {};
  collectSourceItems(sweepData, seen, sourceMap);

  // Build the source summaries, keeping the top items per source
  const sourceSummaries = Object.entries(sourceMap)
    .map(([name, items]) => `## ${name}\n${items.slice(0, 15).join("\n")}`)
    .join("\n\n");

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS)
    .toISOString()
    .split("T")[0];

  const userPrompt = `Today is ${today}. Generate a weekly AI digest covering ONLY the period ${weekAgo} to ${today}.\n\nBelow is fresh data collected today from ${sweepData.sourcesOk || "multiple"} sources. Dates in brackets show when items were published. ONLY include items from this data — do NOT add anything from your own knowledge.\n\n${sourceSummaries}\n\nProduce your JSON weekly digest using ONLY the items above.`;

  try {
    const raw = await llm.chat(
      [{ role: "user", content: `${WEEKLY_SYSTEM_PROMPT}\n\n${userPrompt}` }],
      { maxTokens: 4000 },
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`[Weekly Digest] LLM generation failed: ${err.message}`);
    return null;
  }
}
