// lib/llm/anthropic.mjs — Anthropic Claude provider (raw fetch, no SDK)
import { LLMProvider } from "./provider.mjs";

export class AnthropicProvider extends LLMProvider {
  constructor(apiKey, model = "claude-sonnet-4-6") {
    super("anthropic", model, apiKey);
  }

  async chat(messages, opts = {}) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens || 4096,
        messages,
      }),
    });
    if (!res.ok)
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }
}
