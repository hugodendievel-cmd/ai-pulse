// lib/llm/provider.mjs — Base LLM provider class
export class LLMProvider {
  constructor(name, model, apiKey) {
    this.name = name;
    this.model = model;
    this.apiKey = apiKey;
  }

  async chat(messages, opts = {}) {
    throw new Error(`${this.name}: chat() not implemented`);
  }

  /** Convenience: single-turn prompt → text */
  async prompt(text, opts = {}) {
    const messages = [{ role: "user", content: text }];
    return this.chat(messages, opts);
  }
}
