// --- Constants for Ollama ---
let OLLAMA_API_BASE_URL = "http://localhost:11434";
let OLLAMA_MODEL_NAME = "llama3:8b";
const OLLAMA_SYSTEM_PROMPT_DEFAULT =
  "You are a helpful AI assistant. For mathematical expressions, use standard LaTeX syntax: \$...\$ for inline and $...$ for display. For code blocks, use Markdown triple backticks with a language identifier (e.g., ```python ... ```).";

// --- Global variables (Chat Specific - will become global in a non-module script) ---
let chatHistory;
let userInput;
let sendButton;
let stopButton;
let ollamaServerUrlInput;
let ollamaModelInput;
let ollamaSystemPromptInput;
let setSystemPromptButton; // Ensured this is declared
let hamburgerMenu;
let ollamaSettingsSidebar;
let closeSettingsButton;

let conversationHistory = [];
let abortController = null;
let activeSystemPrompt = OLLAMA_SYSTEM_PROMPT_DEFAULT; // Holds the currently active system prompt

// --- Helper: Escape HTML ---
function escapeHtml(unsafe) {
  if (typeof unsafe !== "string") return "";
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "'"); // Corrected to ' for single quote
}

// --- Content Rendering Function ---
function renderContentToHtml(rawText) {
  if (typeof rawText !== "string") return "";
  if (typeof marked === "undefined") {
    console.error(
      "marked.js library is not loaded. Falling back to basic rendering.",
    );
    // Fallback to simpler rendering if marked.js is missing
    let html = rawText;
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```|`([^`\n]+)`/g,
      (match, lang, codeBlock, inlineCode) => {
        if (codeBlock) {
          const language = lang || "plaintext";
          const escapedCode = escapeHtml(codeBlock.trim());
          return `<pre><code class="language-${language}">${escapedCode}</code></pre>`;
        } else if (inlineCode) {
          return `<code>${escapeHtml(inlineCode)}</code>`;
        }
        return match;
      },
    );
    const parts = html.split(
      /(<pre(?:[\s\S]*?)>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/,
    );
    return parts
      .map((part, index) => {
        if (index % 2 === 1) return part;
        return escapeHtml(part).replace(/\n/g, "<br>");
      })
      .join("");
  }

  // Using marked.js
  // Step 1: Temporarily replace code blocks with placeholders
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const codeBlocks = [];
  let i = 0;
  let processedText = rawText; // Work on a copy

  processedText = processedText.replace(codeBlockRegex, (_, lang, code) => {
    const placeholder = `@@CODE_BLOCK_${i}@@`;
    codeBlocks.push({
      placeholder,
      html: `<pre><code class="language-${lang || "plaintext"}">${escapeHtml(code.trim())}</code></pre>`,
    });
    i++;
    return placeholder;
  });

  // Step 2: Inline code (e.g., `code`) – replace before markdown if marked.js doesn't handle it as preferred
  // marked.js usually handles inline code correctly, so this step might be redundant
  // or could conflict if marked.js also tries to process it.
  // For now, let marked.js handle inline code. If specific behavior is needed, re-evaluate.
  // processedText = processedText.replace(/`([^`\n]+)`/g, (_, code) => {
  //     return `<code>${escapeHtml(code)}</code>`;
  // });

  // Step 3: Use marked.js to parse Markdown (which handles inline code and other markdown)
  // Ensure marked.js is configured to not escape HTML if you pre-escape, or to handle newlines as <br>
  let html = marked.parse(processedText, { breaks: true, gfm: true }); // breaks: true converts \n to <br>

  // Step 4: Replace code block placeholders
  for (const { placeholder, html: codeHtml } of codeBlocks) {
    html = html.replace(placeholder, codeHtml);
  }

  return html;
}

// --- Toggle Sidebar Function ---
function toggleSidebar() {
  hamburgerMenu.classList.toggle("active");
  ollamaSettingsSidebar.classList.toggle("active");

  if (!ollamaSettingsSidebar.classList.contains("active")) {
    setTimeout(() => {
      if (!ollamaSettingsSidebar.classList.contains("active")) {
        ollamaSettingsSidebar.classList.add("hidden");
      }
    }, 300);
  } else {
    ollamaSettingsSidebar.classList.remove("hidden");
  }
}

// --- Chat Functions ---
function addChatMessage(message, sender, isStreaming = false) {
  if (!chatHistory) {
    console.warn("Chat history element not found, cannot add message.");
    return null;
  }
  let messageElement;
  let contentWrapper;

  if (isStreaming && sender === "bot") {
    messageElement = chatHistory.querySelector(".bot-message.streaming");
    if (messageElement) {
      contentWrapper = messageElement.querySelector(".message-content-wrapper");
    }
  }

  if (!messageElement) {
    messageElement = document.createElement("div");
    messageElement.classList.add(
      "message",
      sender === "user" ? "user-message" : "bot-message",
    );
    if (isStreaming && sender === "bot") {
      messageElement.classList.add("streaming");
    }

    contentWrapper = document.createElement("div");
    contentWrapper.className = "message-content-wrapper";
    messageElement.appendChild(contentWrapper);
    chatHistory.appendChild(messageElement);
  }

  if (sender === "user") {
    // For user messages, just escape HTML and convert newlines
    contentWrapper.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
  } else {
    // For bot messages, use the full rendering pipeline
    contentWrapper.innerHTML = renderContentToHtml(message);
  }

  if (sender === "bot") {
    try {
      if (window.katex && typeof window.renderMathInElement === "function") {
        renderMathInElement(contentWrapper, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
          strict: "warn",
        });
      }
    } catch (e) {
      console.error("KaTeX rendering error:", e);
      if (typeof showError === "function")
        showError("KaTeX rendering error. Check console.");
    }
    try {
      if (window.Prism) {
        contentWrapper.querySelectorAll("pre code").forEach((block) => {
          Prism.highlightElement(block);
        });
      }
    } catch (e) {
      console.error("Prism highlighting error:", e);
      if (typeof showError === "function")
        showError("Prism highlighting error. Check console.");
    }
  }

  chatHistory.scrollTop = chatHistory.scrollHeight;
  return messageElement;
}

async function sendMessageToOllama() {
  const userMessage = userInput.value.trim();
  if (!userMessage) return;

  OLLAMA_API_BASE_URL =
    ollamaServerUrlInput.value.trim() || "http://localhost:11434";
  OLLAMA_MODEL_NAME = ollamaModelInput.value.trim() || "llama3:8b";
  // activeSystemPrompt is already up-to-date via the "Set Prompt" button logic

  addChatMessage(userMessage, "user");
  conversationHistory.push({ role: "user", content: userMessage });
  userInput.value = "";

  if (sendButton) sendButton.style.display = "none";
  if (stopButton) {
    stopButton.style.display = "inline-block";
    stopButton.disabled = false;
  }
  if (userInput) userInput.disabled = true;
  if (typeof updateStatus === "function") updateStatus("Asking Ollama...");

  let messagesForOllama = [];
  if (activeSystemPrompt && activeSystemPrompt.trim() !== "") {
    messagesForOllama.push({ role: "system", content: activeSystemPrompt });
  }
  messagesForOllama.push(...conversationHistory);

  abortController = new AbortController();
  let accumulatedResponse = "";
  let botMessageElement = null;
  let errorOccurred = null;

  try {
    console.log(
      "[Chat.js] Sending request to Ollama:",
      OLLAMA_MODEL_NAME,
      "at",
      OLLAMA_API_BASE_URL,
    );
    console.log(
      "[Chat.js] Using System Prompt:",
      activeSystemPrompt || "(none)",
    );
    const response = await fetch(`${OLLAMA_API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL_NAME,
        messages: messagesForOllama,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Unknown error and failed to parse error response.",
      }));
      errorOccurred = new Error(
        `Ollama API Error: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}`,
      );
      throw errorOccurred;
    }

    if (typeof updateStatus === "function")
      updateStatus("Receiving response...");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log("[Chat.js] Stream read complete (done is true).");
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const jsonResponses = chunk
        .split("\n")
        .filter((line) => line.trim() !== "");

      for (const jsonResponse of jsonResponses) {
        try {
          const parsed = JSON.parse(jsonResponse);
          if (parsed.message && parsed.message.content) {
            accumulatedResponse += parsed.message.content;
            if (!botMessageElement) {
              botMessageElement = addChatMessage(
                accumulatedResponse,
                "bot",
                true,
              );
            } else {
              const contentWrapper = botMessageElement.querySelector(
                ".message-content-wrapper",
              );
              if (contentWrapper) {
                contentWrapper.innerHTML =
                  renderContentToHtml(accumulatedResponse); // Use full render
                if (
                  window.katex &&
                  typeof window.renderMathInElement === "function"
                ) {
                  renderMathInElement(contentWrapper, {
                    delimiters: [
                      { left: "$$", right: "$$", display: true },
                      { left: "$", right: "$", display: false },
                      { left: "\\(", right: "\\)", display: false },
                      { left: "\\[", right: "\\]", display: true },
                    ],
                    throwOnError: false,
                    strict: "warn",
                  });
                }
                if (window.Prism) {
                  contentWrapper
                    .querySelectorAll("pre code")
                    .forEach((block) => Prism.highlightElement(block));
                }
              }
            }
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
          if (parsed.done) {
            console.log(
              "[Chat.js] Ollama indicated stream is done in a chunk:",
              parsed,
            );
            await reader.cancel();
          }
        } catch (e) {
          console.warn(
            "[Chat.js] Error parsing JSON chunk:",
            e,
            "Chunk:",
            jsonResponse,
          );
        }
      }
      if (
        jsonResponses.some((jr) => {
          try {
            const p = JSON.parse(jr);
            return p.done && !(p.message && p.message.content);
          } catch {
            return false;
          }
        })
      ) {
        console.log(
          "[Chat.js] Detected 'done' in chunk without content, breaking outer while loop.",
        );
        break;
      }
    }
    if (botMessageElement) {
      botMessageElement.classList.remove("streaming");
    }
  } catch (error) {
    if (!errorOccurred) errorOccurred = error;

    if (errorOccurred.name === "AbortError") {
      accumulatedResponse += "\n[Generation stopped by user]";
      if (botMessageElement) {
        const contentWrapper = botMessageElement.querySelector(
          ".message-content-wrapper",
        );
        if (contentWrapper)
          contentWrapper.innerHTML = renderContentToHtml(accumulatedResponse); // Use full render
        botMessageElement.classList.remove("streaming");
      } else {
        addChatMessage(accumulatedResponse, "bot");
      }
      console.log("[Chat.js] Ollama generation stopped by user.");
    } else {
      if (typeof showError === "function")
        showError(
          `Failed to get response from Ollama: ${errorOccurred.message}`,
        );
      console.error("[Chat.js] Ollama API Interaction Error:", errorOccurred);
      addChatMessage(
        `Sorry, I encountered an error with Ollama: ${errorOccurred.message}`,
        "bot",
      );
    }
  } finally {
    abortController = null;
    if (accumulatedResponse || errorOccurred) {
      conversationHistory.push({
        role: "assistant",
        content:
          accumulatedResponse ||
          (errorOccurred
            ? `Error: ${errorOccurred.message}`
            : "[No response content]"),
      });
    }

    if (sendButton) sendButton.style.display = "inline-block";
    if (stopButton) {
      stopButton.style.display = "none";
      stopButton.disabled = true;
    }
    if (userInput) userInput.disabled = false;

    const isAbortError = errorOccurred && errorOccurred.name === "AbortError";
    if (typeof updateStatus === "function") {
      updateStatus(
        isAbortError
          ? "Generation stopped."
          : errorOccurred
            ? "Error with Ollama."
            : "Ready for input.",
      );
    }

    if (accumulatedResponse.trim() && !errorOccurred) {
      let speakableText = accumulatedResponse
        .replace(/\$\$[\s\S]*?\$\$/g, " a mathematical formula ")
        .replace(/\$[\s\S]*?\$/g, " a mathematical formula ")
        .replace(/```[\s\S]*?```/g, " a code block ")
        .replace(/`[^`\n]+`/g, " a code snippet ")
        .replace(/<[^>]+>/g, " ") // Basic strip tags for TTS
        .replace(/\s+/g, " ")
        .trim();

      if (
        speakableText &&
        window.debug &&
        typeof window.debug.speak === "function"
      ) {
        window.debug.speak(speakableText);
      } else if (window.debug && typeof window.debug.stop === "function") {
        window.debug.stop();
      }
    } else if (window.debug && typeof window.debug.stop === "function") {
      window.debug.stop();
    }
  }
}

// --- Initialization (Chat Part) ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed (chat.js).");

  chatHistory = document.getElementById("chat-history");
  userInput = document.getElementById("user-input");
  window.userInput = userInput;
  sendButton = document.getElementById("send-button");
  window.sendButton = sendButton;
  stopButton = document.getElementById("stop-button");
  window.stopButton = stopButton;

  ollamaServerUrlInput = document.getElementById("ollama-server-url");
  ollamaModelInput = document.getElementById("ollama-model-name");
  ollamaSystemPromptInput = document.getElementById("ollama-system-prompt");
  setSystemPromptButton = document.getElementById("set-system-prompt-button");
  hamburgerMenu = document.getElementById("hamburger-menu");
  ollamaSettingsSidebar = document.getElementById("ollama-settings-sidebar");

  if (
    !chatHistory ||
    !userInput ||
    !sendButton ||
    !stopButton ||
    !ollamaServerUrlInput ||
    !ollamaModelInput ||
    !ollamaSystemPromptInput ||
    !setSystemPromptButton ||
    !hamburgerMenu ||
    !ollamaSettingsSidebar
  ) {
    const errMsg =
      "One or more required chat/Ollama HTML elements are missing. (chat.js)";
    if (typeof showError === "function") {
      showError(errMsg);
    } else {
      console.error(errMsg);
    }
    return;
  }

  closeSettingsButton = document.createElement("button");
  closeSettingsButton.id = "close-settings-button";
  closeSettingsButton.className = "close-settings-button";
  closeSettingsButton.innerHTML = "×"; // Using HTML entity for '×'
  closeSettingsButton.setAttribute("aria-label", "Close settings");
  ollamaSettingsSidebar.insertBefore(
    closeSettingsButton,
    ollamaSettingsSidebar.firstChild,
  );

  // Load settings from localStorage
  ollamaServerUrlInput.value =
    localStorage.getItem("ollamaServerUrl") || "http://localhost:11434";
  ollamaModelInput.value =
    localStorage.getItem("ollamaModelName") || "llama3:8b";

  // Active system prompt is loaded and set to the textarea
  activeSystemPrompt =
    localStorage.getItem("ollamaActiveSystemPrompt") ||
    OLLAMA_SYSTEM_PROMPT_DEFAULT;
  ollamaSystemPromptInput.value = activeSystemPrompt;

  // Event listeners for server URL and model name (update localStorage on change)
  ollamaServerUrlInput.addEventListener("change", () =>
    localStorage.setItem("ollamaServerUrl", ollamaServerUrlInput.value),
  );
  ollamaModelInput.addEventListener("change", () =>
    localStorage.setItem("ollamaModelName", ollamaModelInput.value),
  );

  // REMOVED: ollamaSystemPromptInput.addEventListener('change', () => localStorage.setItem('ollamaSystemPrompt', ollamaSystemPromptInput.value));
  // This was potentially confusing. The 'activeSystemPrompt' is now the single source of truth for what's used,
  // and it's only updated and saved via the "Set Prompt" button.

  // Event listener for the "Set Prompt" button
  setSystemPromptButton.addEventListener("click", () => {
    activeSystemPrompt = ollamaSystemPromptInput.value.trim();
    localStorage.setItem("ollamaActiveSystemPrompt", activeSystemPrompt);
    if (typeof updateStatus === "function")
      updateStatus("System prompt updated successfully.");
    console.log("Active system prompt set to:", activeSystemPrompt);
  });

  hamburgerMenu.addEventListener("click", toggleSidebar);
  closeSettingsButton.addEventListener("click", toggleSidebar);

  if (userInput) userInput.disabled = false;
  if (sendButton) sendButton.disabled = false;
  if (stopButton) {
    stopButton.style.display = "none";
    stopButton.disabled = true;
  }

  if (sendButton) sendButton.addEventListener("click", sendMessageToOllama);
  if (stopButton) {
    stopButton.addEventListener("click", () => {
      if (abortController) {
        abortController.abort();
        if (typeof updateStatus === "function")
          updateStatus("Stopping generation...");
        if (stopButton) stopButton.disabled = true;
      }
    });
  }

  if (userInput) {
    userInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (
          sendButton &&
          sendButton.style.display !== "none" &&
          !sendButton.disabled
        ) {
          sendMessageToOllama();
        }
      }
    });
  }

  setTimeout(() => {
    if (chatHistory) {
      addChatMessage("Hello! I'm Hana. How can I help you today?", "bot");
    }
  }, 300);

  console.log("Chat system with Ollama initialized.");
});
