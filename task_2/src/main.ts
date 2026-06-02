import "./styles.css";
import { marked } from "marked";
import { ChatMessage, ChatSettings, requestChatCompletion } from "./deepseek";

type UiChatMessage = ChatMessage & {
  createdAt: string;
};

const customModelValue = "__custom__";
const modelOptions = [
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

const initialSettings: ChatSettings = {
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

let messages: UiChatMessage[] = [];
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
`;

const messagesContainer = appRoot.querySelector<HTMLDivElement>("[data-messages]")!;
const composer = appRoot.querySelector<HTMLFormElement>("[data-composer]")!;
const messageInput = appRoot.querySelector<HTMLTextAreaElement>("[data-message-input]")!;
const sendButton = appRoot.querySelector<HTMLButtonElement>("[data-send-button]")!;
const temperatureValue = appRoot.querySelector<HTMLOutputElement>("[data-temperature-value]")!;
const topPValue = appRoot.querySelector<HTMLOutputElement>("[data-top-p-value]")!;
const customModelField = appRoot.querySelector<HTMLLabelElement>("[data-custom-model-field]")!;
const customModelInput = appRoot.querySelector<HTMLInputElement>("[data-custom-model]")!;

if (
  !messagesContainer ||
  !composer ||
  !messageInput ||
  !sendButton ||
  !temperatureValue ||
  !topPValue ||
  !customModelField ||
  !customModelInput
) {
  throw new Error("Required UI elements were not found.");
}

function syncSettingsForm() {
  appRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    const settingName = control.dataset.setting as keyof ChatSettings;

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
    settings.temperature = Number(rawValue);
    temperatureValue.textContent = settings.temperature.toFixed(1);
    return;
  }

  if (name === "topP") {
    settings.topP = Number(rawValue);
    topPValue.textContent = settings.topP.toFixed(2);
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

function renderMessageContent(message: UiChatMessage) {
  if (message.role !== "assistant") {
    return `<p>${escapeHtml(message.content)}</p>`;
  }

  return sanitizeMarkdown(marked.parse(message.content, { async: false }) as string);
}

function sanitizeMarkdown(html: string) {
  const allowedTags = new Set([
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ]);
  const allowedAttributes = new Set(["href", "title"]);
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (!allowedTags.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();

      if (!allowedAttributes.has(attributeName)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (tagName === "a") {
      const href = element.getAttribute("href") || "";

      if (!/^https?:\/\//i.test(href) && !href.startsWith("#")) {
        element.removeAttribute("href");
      }

      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    }
  });

  return template.innerHTML;
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

  const settingName = target.dataset.setting as keyof ChatSettings | undefined;

  if (settingName) {
    updateSetting(settingName, target.value);
  }
}

appRoot.addEventListener("input", handleSettingsEvent);
appRoot.addEventListener("change", handleSettingsEvent);

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
renderMessages();
