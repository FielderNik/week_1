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
  maxTokens: number;
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
      max_tokens: settings.maxTokens,
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
