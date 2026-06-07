export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ResponseFormat = "text" | "json_object";
export type ThinkingMode = "enabled" | "disabled";
export type ReasoningEffort = "high" | "max";

export type ChatSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  responseFormat: ResponseFormat;
  stopSequences: string;
  thinkingMode: ThinkingMode;
  reasoningEffort: ReasoningEffort;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type UiChatMessage = ChatMessage & {
  createdAt: string;
};

export type SavedChatMetadata = Omit<ChatSettings, "apiKey"> & {
  tokenUsage?: TokenUsage;
};

export type SavedChat = {
  id: string;
  title: string;
  messages: UiChatMessage[];
  metadata: SavedChatMetadata;
  createdAt: string;
  updatedAt: string;
};
