import type { ChatSettings } from "./types";

export const customModelValue = "__custom__";

export const modelOptions = [
  {
    value: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
  },
  {
    value: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
  },
  {
    value: "deepseek-chat",
    label: "DeepSeek Chat (legacy)",
  },
  {
    value: "deepseek-reasoner",
    label: "DeepSeek Reasoner (legacy)",
  },
];

export const initialSettings: ChatSettings = {
  apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || "",
  baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  model: import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-v4-flash",
  systemPrompt: "Ты полезный AI-ассистент. Отвечай кратко и по делу.",
  temperature: 0.7,
  topP: 1,
  maxTokens: 1200,
  responseFormat: "text",
  stopSequences: "",
  thinkingMode: "enabled",
  reasoningEffort: "high",
};

export function isChatSettingsKey(value: string): value is keyof ChatSettings {
  return value in initialSettings;
}

export function parseNumberSetting(rawValue: string, fallback: number, min: number, max: number) {
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
