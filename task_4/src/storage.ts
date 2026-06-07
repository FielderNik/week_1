import type { SavedChat, SavedChatMetadata, TokenUsage, UiChatMessage } from "./types";

const savedChatsStorageKey = "chat_template:saved-chats";

export function loadSavedChats() {
  try {
    const rawValue = localStorage.getItem(savedChatsStorageKey);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSavedChat).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function persistSavedChats(savedChats: SavedChat[]) {
  localStorage.setItem(savedChatsStorageKey, JSON.stringify(savedChats));
}

function isSavedChat(value: unknown): value is SavedChat {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SavedChat>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isUiChatMessage) &&
    isSavedChatMetadata(candidate.metadata) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isUiChatMessage(value: unknown): value is UiChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UiChatMessage>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function isSavedChatMetadata(value: unknown): value is SavedChatMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SavedChatMetadata>;
  return (
    typeof candidate.baseUrl === "string" &&
    typeof candidate.model === "string" &&
    typeof candidate.systemPrompt === "string" &&
    typeof candidate.temperature === "number" &&
    typeof candidate.topP === "number" &&
    typeof candidate.maxTokens === "number" &&
    (candidate.responseFormat === "text" || candidate.responseFormat === "json_object") &&
    typeof candidate.stopSequences === "string" &&
    (candidate.thinkingMode === "enabled" || candidate.thinkingMode === "disabled") &&
    (candidate.reasoningEffort === "high" || candidate.reasoningEffort === "max") &&
    (candidate.tokenUsage === undefined || isTokenUsage(candidate.tokenUsage))
  );
}

function isTokenUsage(value: unknown): value is TokenUsage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TokenUsage>;
  return (
    typeof candidate.promptTokens === "number" &&
    typeof candidate.completionTokens === "number" &&
    typeof candidate.totalTokens === "number"
  );
}
