import "./styles.css";
import { requestChatCompletion } from "./deepseek";
import { renderMarkdown } from "./markdown";
import { customModelValue, initialSettings, isChatSettingsKey, modelOptions, parseNumberSetting } from "./settings";
import { loadSavedChats, persistSavedChats } from "./storage";
import type { ChatMessage, ChatSettings, SavedChat, SavedChatMetadata, UiChatMessage } from "./types";

let messages: UiChatMessage[] = [];
let settings: ChatSettings = { ...initialSettings };
let savedChats: SavedChat[] = loadSavedChats();
let activeSavedChatId: string | null = null;
let currentChatTitle = "Новый диалог";
let isSending = false;
let activeRequest: AbortController | null = null;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

const appRoot = app;

appRoot.innerHTML = `
  <main class="app-shell">
    <aside class="saved-dialogs-panel" aria-label="Saved chats">
      <div class="saved-dialogs-header">
        <div>
          <p class="wordmark">Chat Template</p>
          <h2>Диалоги</h2>
        </div>
        <button
          class="icon-button danger-icon-button"
          data-action="clear-saved-dialogs"
          data-clear-saved-dialogs-button
          type="button"
          aria-label="Очистить сохраненные диалоги"
          title="Очистить сохраненные диалоги"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 16h10l1-16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
      <div class="saved-dialogs-list" data-saved-dialogs></div>
    </aside>

    <section class="chat-panel" aria-label="AI chat">
      <header class="chat-header">
        <div>
          <h1>AI Chat Template</h1>
          <p>Минимальный браузерный чат для задач курса</p>
        </div>
        <div class="header-actions">
          <button class="primary-button compact-button" data-action="save" type="button">Сохранить</button>
          <button class="ghost-button" data-action="clear" type="button">Очистить</button>
        </div>
      </header>

      <section class="dialog-info" aria-label="Текущий диалог">
        <div class="dialog-title-block">
          <span>Текущий диалог</span>
          <strong data-current-dialog-title></strong>
        </div>
        <details class="dialog-metadata">
          <summary>Метаданные: настройки ИИ</summary>
          <dl data-current-dialog-metadata></dl>
        </details>
      </section>

      <div class="messages" data-messages aria-live="polite"></div>

      <form class="composer" data-composer>
        <label class="visually-hidden" for="message-input">Сообщение</label>
        <textarea
          id="message-input"
          name="message"
          rows="3"
          placeholder="Спросите что-нибудь"
          autocomplete="off"
          data-message-input
        ></textarea>
        <button class="primary-button" type="submit" data-send-button>Отправить</button>
      </form>
    </section>

    <aside class="settings-panel" aria-label="Chat settings">
      <h2>Параметры AI</h2>

      <form class="settings-form" autocomplete="off">
        <label>
          <span>Ключ API <code>api_key</code></span>
          <input data-setting="apiKey" type="password" autocomplete="off" placeholder="Берется из .env.local" />
        </label>

        <label>
          <span>Адрес API <code>base_url</code></span>
          <input data-setting="baseUrl" type="url" />
        </label>

        <label>
          <span>Модель <code>model</code></span>
          <select data-setting="model">
            ${modelOptions
              .map((model) => `<option value="${model.value}">${model.label}</option>`)
              .join("")}
            <option value="${customModelValue}">Custom model</option>
          </select>
        </label>

        <label class="custom-model-field" data-custom-model-field hidden>
          <span>Своя модель <code>model</code></span>
          <input data-custom-model type="text" placeholder="provider-model-id" />
        </label>

        <label>
          <span>Системный промпт <code>messages[0]</code></span>
          <textarea data-setting="systemPrompt" rows="4"></textarea>
        </label>

        <label>
          <span>Креативность <code>temperature</code> <output data-temperature-value></output></span>
          <input data-setting="temperature" type="range" min="0" max="2" step="0.1" />
        </label>

        <label>
          <span>Ядро вероятностей <code>top_p</code> <output data-top-p-value></output></span>
          <input data-setting="topP" type="range" min="0" max="1" step="0.05" />
        </label>

        <label>
          <span>Максимум токенов <code>max_tokens</code></span>
          <input data-setting="maxTokens" type="number" min="1" max="8000" step="100" />
        </label>

        <label>
          <span>Формат ответа <code>response_format.type</code></span>
          <select data-setting="responseFormat">
            <option value="text">Текст</option>
            <option value="json_object">JSON object</option>
          </select>
        </label>

        <label>
          <span>Стоп-последовательности <code>stop</code></span>
          <textarea data-setting="stopSequences" rows="3" placeholder="Одна строка = одна stop sequence"></textarea>
        </label>

        <label>
          <span>Режим размышления <code>thinking.type</code></span>
          <select data-setting="thinkingMode">
            <option value="enabled">Включен</option>
            <option value="disabled">Выключен</option>
          </select>
        </label>

        <label>
          <span>Глубина размышления <code>thinking.reasoning_effort</code></span>
          <select data-setting="reasoningEffort">
            <option value="high">High</option>
            <option value="max">Max</option>
          </select>
        </label>
      </form>
    </aside>
  </main>

  <dialog class="save-dialog" data-save-dialog>
    <form class="save-dialog-form" data-save-dialog-form>
      <div>
        <p class="eyebrow">Сохранение</p>
        <h2>Название диалога</h2>
      </div>
      <label>
        <span>Название</span>
        <input data-save-title type="text" maxlength="80" required />
      </label>
      <div class="save-dialog-actions">
        <button class="ghost-button" data-action="cancel-save" type="button">Отмена</button>
        <button class="primary-button" type="submit">Сохранить</button>
      </div>
    </form>
  </dialog>
`;

const savedDialogsContainer = appRoot.querySelector<HTMLDivElement>("[data-saved-dialogs]")!;
const clearSavedDialogsButton = appRoot.querySelector<HTMLButtonElement>("[data-clear-saved-dialogs-button]")!;
const messagesContainer = appRoot.querySelector<HTMLDivElement>("[data-messages]")!;
const composer = appRoot.querySelector<HTMLFormElement>("[data-composer]")!;
const messageInput = appRoot.querySelector<HTMLTextAreaElement>("[data-message-input]")!;
const sendButton = appRoot.querySelector<HTMLButtonElement>("[data-send-button]")!;
const currentDialogTitleElement = appRoot.querySelector<HTMLElement>("[data-current-dialog-title]")!;
const currentDialogMetadataElement = appRoot.querySelector<HTMLElement>("[data-current-dialog-metadata]")!;
const saveDialog = appRoot.querySelector<HTMLDialogElement>("[data-save-dialog]")!;
const saveDialogForm = appRoot.querySelector<HTMLFormElement>("[data-save-dialog-form]")!;
const saveTitleInput = appRoot.querySelector<HTMLInputElement>("[data-save-title]")!;
const temperatureValue = appRoot.querySelector<HTMLOutputElement>("[data-temperature-value]")!;
const topPValue = appRoot.querySelector<HTMLOutputElement>("[data-top-p-value]")!;
const customModelField = appRoot.querySelector<HTMLLabelElement>("[data-custom-model-field]")!;
const customModelInput = appRoot.querySelector<HTMLInputElement>("[data-custom-model]")!;

if (
  !savedDialogsContainer ||
  !clearSavedDialogsButton ||
  !messagesContainer ||
  !composer ||
  !messageInput ||
  !sendButton ||
  !currentDialogTitleElement ||
  !currentDialogMetadataElement ||
  !saveDialog ||
  !saveDialogForm ||
  !saveTitleInput ||
  !temperatureValue ||
  !topPValue ||
  !customModelField ||
  !customModelInput
) {
  throw new Error("Required UI elements were not found.");
}

function createChatId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSettingsMetadata(): SavedChatMetadata {
  const { apiKey: _apiKey, ...metadata } = settings;
  return { ...metadata };
}

function applySavedMetadata(metadata: SavedChatMetadata) {
  settings = {
    ...metadata,
    apiKey: settings.apiKey,
  };
  syncSettingsForm();
}

function syncSettingsForm() {
  appRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    const settingName = control.dataset.setting;

    if (!settingName || !isChatSettingsKey(settingName)) {
      return;
    }

    if (settingName === "model" && control instanceof HTMLSelectElement) {
      const isKnownModel = modelOptions.some((model) => model.value === settings.model);
      control.value = isKnownModel ? settings.model : customModelValue;
      customModelField.hidden = isKnownModel;
      customModelInput.value = isKnownModel ? "" : settings.model;
      return;
    }

    control.value = String(settings[settingName]);
  });
  temperatureValue.textContent = settings.temperature.toFixed(1);
  topPValue.textContent = settings.topP.toFixed(2);
}

function renderSavedChats() {
  clearSavedDialogsButton.disabled = savedChats.length === 0;

  if (savedChats.length === 0) {
    savedDialogsContainer.innerHTML = `
      <p class="saved-dialogs-empty">Сохраненных диалогов пока нет.</p>
    `;
    return;
  }

  savedDialogsContainer.innerHTML = savedChats
    .map((chat) => {
      const isActive = chat.id === activeSavedChatId;
      const messagesCount = chat.messages.length;

      return `
        <button
          class="saved-dialog-item${isActive ? " is-active" : ""}"
          data-action="open-saved-dialog"
          data-dialog-id="${escapeHtml(chat.id)}"
          type="button"
        >
          <strong>${escapeHtml(chat.title)}</strong>
          <span>${formatSavedChatDate(chat.updatedAt)} · ${messagesCount} ${getMessagesWord(messagesCount)}</span>
          <small>${escapeHtml(chat.metadata.model)}</small>
        </button>
      `;
    })
    .join("");
}

function renderCurrentDialogInfo() {
  currentDialogTitleElement.textContent = currentChatTitle;
  currentDialogMetadataElement.innerHTML = renderSettingsMetadata(settings);
}

function renderMessages() {
  renderCurrentDialogInfo();

  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="empty-state">
        <h2>С чего начнем?</h2>
        <p>Шаблон готов отправлять сообщения в DeepSeek API.</p>
      </div>
    `;
    return;
  }

  const renderedMessages = messages
    .map(
      (message) => `
        <article class="message ${message.role}">
          <div class="message-meta">
            <strong>${message.role === "user" ? "Вы" : "AI"}</strong>
            <time datetime="${message.createdAt}">${formatMessageTime(message.createdAt)}</time>
          </div>
          <div class="message-content">
            ${renderMessageContent(message)}
          </div>
        </article>
      `,
    )
    .join("");

  const typingIndicator = isSending
    ? `
        <article class="message assistant typing-message" aria-live="polite">
          <div class="message-meta">
            <strong>AI</strong>
            <span>набирает сообщение</span>
          </div>
          <div class="typing-dots" aria-label="AI набирает сообщение">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </article>
      `
    : "";

  messagesContainer.innerHTML = renderedMessages + typingIndicator;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setSending(nextValue: boolean) {
  isSending = nextValue;
  sendButton.textContent = nextValue ? "Отправка..." : "Отправить";
  sendButton.disabled = nextValue;
  messageInput.disabled = nextValue;
}

function updateSetting(name: keyof ChatSettings, rawValue: string) {
  if (name === "model") {
    if (rawValue === customModelValue) {
      customModelField.hidden = false;
      customModelInput.focus();
      settings.model = customModelInput.value.trim() || settings.model;
      return;
    }

    customModelField.hidden = true;
    customModelInput.value = "";
    settings.model = rawValue;
    return;
  }

  if (name === "temperature") {
    settings.temperature = parseNumberSetting(rawValue, settings.temperature, 0, 2);
    temperatureValue.textContent = settings.temperature.toFixed(1);
    return;
  }

  if (name === "topP") {
    settings.topP = parseNumberSetting(rawValue, settings.topP, 0, 1);
    topPValue.textContent = settings.topP.toFixed(2);
    return;
  }

  if (name === "maxTokens") {
    settings.maxTokens = parseNumberSetting(rawValue, settings.maxTokens, 1, 8000);
    return;
  }

  settings = {
    ...settings,
    [name]: rawValue,
  };
}

function renderSettingsMetadata(value: ChatSettings | SavedChatMetadata) {
  const rows: Array<[string, string]> = [
    ["base_url", value.baseUrl],
    ["model", value.model],
    ["system_prompt", value.systemPrompt || "не задан"],
    ["temperature", value.temperature.toFixed(1)],
    ["top_p", value.topP.toFixed(2)],
    ["max_tokens", String(value.maxTokens)],
    ["response_format", value.responseFormat],
    ["stop", value.stopSequences.trim() || "не заданы"],
    ["thinking.type", value.thinkingMode],
    ["thinking.reasoning_effort", value.reasoningEffort],
  ];

  return rows
    .map(
      ([name, value]) => `
        <div>
          <dt>${escapeHtml(name)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `,
    )
    .join("");
}

function formatSavedChatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getMessagesWord(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "сообщений";
  }

  if (lastDigit === 1) {
    return "сообщение";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "сообщения";
  }

  return "сообщений";
}

function getDefaultChatTitle() {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();

  if (firstUserMessage) {
    return firstUserMessage.length > 48 ? `${firstUserMessage.slice(0, 48)}...` : firstUserMessage;
  }

  return `Диалог ${formatSavedChatDate(new Date().toISOString())}`;
}

function openSaveDialog() {
  saveTitleInput.value = currentChatTitle === "Новый диалог" ? getDefaultChatTitle() : currentChatTitle;
  saveDialog.showModal();
  saveTitleInput.focus();
  saveTitleInput.select();
}

function saveCurrentChat(title: string) {
  const now = new Date().toISOString();
  const existingIndex = activeSavedChatId ? savedChats.findIndex((chat) => chat.id === activeSavedChatId) : -1;
  const existingChat = existingIndex >= 0 ? savedChats[existingIndex] : null;
  const savedChat: SavedChat = {
    id: existingChat?.id || createChatId(),
    title,
    messages: messages.map((message) => ({ ...message })),
    metadata: getSettingsMetadata(),
    createdAt: existingChat?.createdAt || now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    savedChats = savedChats.map((chat) => (chat.id === savedChat.id ? savedChat : chat));
  } else {
    savedChats = [savedChat, ...savedChats];
  }

  savedChats = savedChats.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  activeSavedChatId = savedChat.id;
  currentChatTitle = savedChat.title;
  persistSavedChats(savedChats);
  renderSavedChats();
  renderMessages();
}

function clearSavedChats() {
  if (savedChats.length === 0) {
    return;
  }

  const shouldClear = confirm("Удалить все сохраненные диалоги?");

  if (!shouldClear) {
    return;
  }

  savedChats = [];
  activeSavedChatId = null;
  currentChatTitle = "Новый диалог";
  persistSavedChats(savedChats);
  renderSavedChats();
  renderMessages();
  messageInput.focus();
}

function openSavedChat(id: string) {
  const savedChat = savedChats.find((chat) => chat.id === id);

  if (!savedChat) {
    return;
  }

  activeRequest?.abort();
  activeRequest = null;
  activeSavedChatId = savedChat.id;
  currentChatTitle = savedChat.title;
  messages = savedChat.messages.map((message) => ({ ...message }));
  applySavedMetadata(savedChat.metadata);
  setSending(false);
  renderSavedChats();
  renderMessages();
  messageInput.focus();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMessageContent(message: UiChatMessage) {
  if (message.role !== "assistant") {
    return `<p>${escapeHtml(message.content)}</p>`;
  }

  return renderMarkdown(message.content);
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function handleSettingsEvent(event: Event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.dataset.customModel !== undefined) {
    settings.model = target.value.trim();
    return;
  }

  const settingName = target.dataset.setting;

  if (settingName && isChatSettingsKey(settingName)) {
    updateSetting(settingName, target.value);
    renderCurrentDialogInfo();
  }
}

appRoot.addEventListener("input", handleSettingsEvent);
appRoot.addEventListener("change", handleSettingsEvent);

appRoot.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("button");

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (button.dataset.action === "save") {
    openSaveDialog();
    return;
  }

  if (button.dataset.action === "cancel-save") {
    saveDialog.close();
    return;
  }

  if (button.dataset.action === "open-saved-dialog" && button.dataset.dialogId) {
    openSavedChat(button.dataset.dialogId);
    return;
  }

  if (button.dataset.action === "clear-saved-dialogs") {
    clearSavedChats();
    return;
  }

  if (button.dataset.action === "clear") {
    activeRequest?.abort();
    activeRequest = null;
    messages = [];
    activeSavedChatId = null;
    currentChatTitle = "Новый диалог";
    setSending(false);
    renderSavedChats();
    renderMessages();
    messageInput.focus();
  }
});

saveDialogForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = saveTitleInput.value.trim();

  if (!title) {
    saveTitleInput.focus();
    return;
  }

  saveCurrentChat(title);
  saveDialog.close();
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSending) {
    return;
  }

  const prompt = messageInput.value.trim();

  if (!prompt) {
    messageInput.focus();
    return;
  }

  if (!settings.apiKey.trim()) {
    messages = [
      ...messages,
      {
        role: "assistant",
        content: "Добавьте DeepSeek API key в .env.local или во временное поле API key.",
        createdAt: new Date().toISOString(),
      },
    ];
    renderMessages();
    return;
  }

  const nextMessages: UiChatMessage[] = [
    ...messages,
    { role: "user", content: prompt, createdAt: new Date().toISOString() },
  ];
  messages = nextMessages;
  messageInput.value = "";
  setSending(true);
  renderMessages();

  activeRequest = new AbortController();

  try {
    const apiMessages: ChatMessage[] = nextMessages.map(({ role, content }) => ({ role, content }));
    const answer = await requestChatCompletion(apiMessages, settings, activeRequest.signal);
    messages = [...nextMessages, { role: "assistant", content: answer, createdAt: new Date().toISOString() }];
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    messages = [
      ...nextMessages,
      {
        role: "assistant",
        content: error instanceof Error ? error.message : "Не удалось получить ответ от AI API.",
        createdAt: new Date().toISOString(),
      },
    ];
  } finally {
    activeRequest = null;
    setSending(false);
    renderMessages();
    messageInput.focus();
  }
});

syncSettingsForm();
renderSavedChats();
renderMessages();
