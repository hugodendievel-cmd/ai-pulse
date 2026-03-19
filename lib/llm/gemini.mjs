// lib/llm/gemini.mjs — Google Gemini provider (raw fetch, no SDK)
import { LLMProvider } from "./provider.mjs";

export class GeminiProvider extends LLMProvider {
  constructor(apiKey, model = "gemini-2.0-flash") {
    super("gemini", model, apiKey);
  }

  async chat(messages, opts = {}) {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: opts.maxTokens || 4096 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}
