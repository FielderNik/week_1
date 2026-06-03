export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  responseFormat: "text" | "json_object";
  stopSequences: string;
  thinkingMode: "enabled" | "disabled";
  reasoningEffort: "high" | "max";
};

type DeepSeekChoice = {
  message?: {
    role?: string;
    content?: string;
  };
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
  error?: {
    message?: string;
  };
};

export async function requestChatCompletion(
  history: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal,
): Promise<string> {
  const messages: ChatMessage[] = [
    ...(settings.systemPrompt.trim()
      ? [{ role: "system" as const, content: settings.systemPrompt.trim() }]
      : []),
    ...history,
  ];

  const stop = settings.stopSequences
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);

  const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      response_format: {
        type: settings.responseFormat,
      },
      stop: stop.length > 0 ? stop : null,
      thinking: {
        type: settings.thinkingMode,
        reasoning_effort: settings.reasoningEffort,
      },
      stream: false,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as DeepSeekResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `DeepSeek API returned ${response.status}`);
  }

  const answer = data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("DeepSeek API returned an empty response.");
  }

  return answer;
}
