import type { ChatMessage, ChatSettings, ReasoningEffort, ResponseFormat, ThinkingMode, TokenUsage } from "./types";

type DeepSeekRequestSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  responseFormat: ResponseFormat;
  stopSequences: string;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
};

type DeepSeekChoice = {
  message?: {
    role?: string;
    content?: string;
  };
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  top_p: number;
  max_tokens: number;
  response_format?: {
    type: ResponseFormat;
  };
  stop?: string[];
  thinking?: {
    type: ThinkingMode;
    reasoning_effort?: ReasoningEffort;
  };
  stream: false;
};

type ChatCompletionResult = {
  content: string;
  usage?: TokenUsage;
};

export async function requestChatCompletion(
  history: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  const requestSettings = toDeepSeekRequestSettings(settings);
  const messages: ChatMessage[] = [
    ...(requestSettings.systemPrompt.trim()
      ? [{ role: "system" as const, content: requestSettings.systemPrompt.trim() }]
      : []),
    ...history,
  ];

  const stop = requestSettings.stopSequences
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);
  const body: DeepSeekRequestBody = {
    model: requestSettings.model,
    messages,
    temperature: requestSettings.temperature,
    top_p: requestSettings.topP,
    max_tokens: requestSettings.maxTokens,
    stream: false,
  };

  if (requestSettings.responseFormat !== "text") {
    body.response_format = {
      type: requestSettings.responseFormat,
    };
  }

  if (stop.length > 0) {
    body.stop = stop;
  }

  if (requestSettings.thinkingMode) {
    body.thinking = {
      type: requestSettings.thinkingMode,
      ...(requestSettings.thinkingMode === "enabled" && requestSettings.reasoningEffort
        ? { reasoning_effort: requestSettings.reasoningEffort }
        : {}),
    };
  }

  const response = await fetch(`${requestSettings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requestSettings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as DeepSeekResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `DeepSeek API returned ${response.status}`);
  }

  const answer = data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("DeepSeek API returned an empty response.");
  }

  return {
    content: answer,
    usage: toTokenUsage(data.usage),
  };
}

function toTokenUsage(usage: DeepSeekResponse["usage"]): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function toDeepSeekRequestSettings(settings: ChatSettings): DeepSeekRequestSettings {
  const baseSettings: DeepSeekRequestSettings = {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: settings.systemPrompt,
    temperature: settings.temperature,
    topP: settings.topP,
    maxTokens: settings.maxTokens,
    responseFormat: settings.responseFormat,
    stopSequences: settings.stopSequences,
  };

  if (settings.model.startsWith("deepseek-v4")) {
    return {
      ...baseSettings,
      thinkingMode: settings.thinkingMode,
      reasoningEffort: settings.thinkingMode === "enabled" ? settings.reasoningEffort : undefined,
    };
  }

  return baseSettings;
}
