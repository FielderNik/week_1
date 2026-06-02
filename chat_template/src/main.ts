import "./styles.css";
import { ChatMessage, ChatSettings, requestChatCompletion } from "./deepseek";

const initialSettings: ChatSettings = {
  apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || "",
  baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  model: import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-v4-flash",
  systemPrompt: "Ты полезный AI-ассистент. Отвечай кратко и по делу.",
  temperature: 0.7,
  maxTokens: 1200,
};

let messages: ChatMessage[] = [];
let settings: ChatSettings = { ...initialSettings };
let isSending = false;
let activeRequest: AbortController | null = null;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

const appRoot = app;

appRoot.innerHTML = `
  <main class="app-shell">
    <section class="chat-panel" aria-label="AI chat">
      <header class="chat-header">
        <div>
          <p class="eyebrow">AI Chat Template</p>
          <h1>Минимальный чат</h1>
        </div>
        <button class="ghost-button" data-action="clear" type="button">Очистить</button>
      </header>

      <div class="messages" data-messages aria-live="polite"></div>

      <form class="composer" data-composer>
        <label class="visually-hidden" for="message-input">Сообщение</label>
        <textarea
          id="message-input"
          name="message"
          rows="3"
          placeholder="Напишите сообщение..."
          autocomplete="off"
          data-message-input
        ></textarea>
        <button class="primary-button" type="submit" data-send-button>Отправить</button>
      </form>
    </section>

    <aside class="settings-panel" aria-label="Chat settings">
      <h2>Параметры</h2>

      <form class="settings-form" autocomplete="off">
        <label>
          <span>API key</span>
          <input data-setting="apiKey" type="password" autocomplete="off" placeholder="Берется из .env.local" />
        </label>

        <label>
          <span>Base URL</span>
          <input data-setting="baseUrl" type="url" />
        </label>

        <label>
          <span>Model</span>
          <input data-setting="model" type="text" />
        </label>

        <label>
          <span>System prompt</span>
          <textarea data-setting="systemPrompt" rows="4"></textarea>
        </label>

        <label>
          <span>Temperature <output data-temperature-value></output></span>
          <input data-setting="temperature" type="range" min="0" max="2" step="0.1" />
        </label>

        <label>
          <span>Max tokens</span>
          <input data-setting="maxTokens" type="number" min="1" max="8000" step="100" />
        </label>
      </form>
    </aside>
  </main>
`;

const messagesContainer = appRoot.querySelector<HTMLDivElement>("[data-messages]")!;
const composer = appRoot.querySelector<HTMLFormElement>("[data-composer]")!;
const messageInput = appRoot.querySelector<HTMLTextAreaElement>("[data-message-input]")!;
const sendButton = appRoot.querySelector<HTMLButtonElement>("[data-send-button]")!;
const temperatureValue = appRoot.querySelector<HTMLOutputElement>("[data-temperature-value]")!;

if (!messagesContainer || !composer || !messageInput || !sendButton || !temperatureValue) {
  throw new Error("Required UI elements were not found.");
}

function syncSettingsForm() {
  appRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-setting]").forEach((control) => {
    const settingName = control.dataset.setting as keyof ChatSettings;
    control.value = String(settings[settingName]);
  });
  temperatureValue.textContent = settings.temperature.toFixed(1);
}

function renderMessages() {
  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="empty-state">
        <h2>Начните диалог</h2>
        <p>Шаблон готов к отправке сообщений в DeepSeek API.</p>
      </div>
    `;
    return;
  }

  messagesContainer.innerHTML = messages
    .map(
      (message) => `
        <article class="message ${message.role}">
          <strong>${message.role === "user" ? "Вы" : "AI"}</strong>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `,
    )
    .join("");

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setSending(nextValue: boolean) {
  isSending = nextValue;
  sendButton.textContent = nextValue ? "Отправка..." : "Отправить";
  sendButton.disabled = nextValue;
  messageInput.disabled = nextValue;
}

function updateSetting(name: keyof ChatSettings, rawValue: string) {
  if (name === "temperature") {
    settings.temperature = Number(rawValue);
    temperatureValue.textContent = settings.temperature.toFixed(1);
    return;
  }

  if (name === "maxTokens") {
    settings.maxTokens = Number(rawValue);
    return;
  }

  settings = {
    ...settings,
    [name]: rawValue,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

appRoot.addEventListener("input", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  const settingName = target.dataset.setting as keyof ChatSettings | undefined;

  if (settingName) {
    updateSetting(settingName, target.value);
  }
});

appRoot.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  if (target.dataset.action === "clear") {
    activeRequest?.abort();
    activeRequest = null;
    messages = [];
    setSending(false);
    renderMessages();
    messageInput.focus();
  }
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
      },
    ];
    renderMessages();
    return;
  }

  const nextMessages: ChatMessage[] = [...messages, { role: "user", content: prompt }];
  messages = nextMessages;
  messageInput.value = "";
  renderMessages();
  setSending(true);

  activeRequest = new AbortController();

  try {
    const answer = await requestChatCompletion(nextMessages, settings, activeRequest.signal);
    messages = [...nextMessages, { role: "assistant", content: answer }];
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    messages = [
      ...nextMessages,
      {
        role: "assistant",
        content: error instanceof Error ? error.message : "Не удалось получить ответ от AI API.",
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
renderMessages();
