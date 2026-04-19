// lib/llm/openai.mjs — OpenAI GPT provider (raw fetch, no SDK)
import { LLMProvider } from "./provider.mjs";

export class OpenAIProvider extends LLMProvider {
  constructor(apiKey, model = "gpt-4.1") {
    super("openai", model, apiKey);
  }

  async chat(messages, opts = {}) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: opts.maxTokens || 4096,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
}
