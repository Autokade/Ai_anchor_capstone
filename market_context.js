// Adds live Indian market data to market-related Ollama questions.
// This keeps the existing chat.js and Ollama streaming code unchanged.

const MARKET_API_BASE_URL = "http://localhost:5000";
const originalFetch = window.fetch.bind(window);

function isMarketQuestion(text) {
  return /\b(market|nifty|sensex|stock|stocks|share|shares|equity|trading|bullish|bearish|indices|index|bse|nse|reliance|tcs|infosys|hdfc|icici)\b/i.test(text || "");
}

function buildMarketContext(data) {
  const nifty = data.nifty || {};
  const sensex = data.sensex || {};
  const consensus = data.consensus || {};

  return [
    "LIVE INDIAN MARKET DATA (retrieved from the local market-data service):",
    `Date/time: ${data.timestamp || "unknown"}`,
    `NIFTY 50: ${nifty.price ?? "unavailable"} (${nifty.change_percent ?? "unavailable"}%)`,
    `SENSEX: ${sensex.price ?? "unavailable"} (${sensex.change_percent ?? "unavailable"}%)`,
    `Quantitative market sentiment: ${consensus.sentiment ?? "unavailable"}`,
    `Average index change: ${consensus.average_change_percent ?? "unavailable"}%`,
    "Use these values when answering the user's market question. Do not invent current prices or percentages.",
    "The quantitative sentiment is only a simple index-movement signal, not investment advice.",
  ].join("\n");
}

window.fetch = async function (input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";

  // Only augment requests going to Ollama's /api/chat endpoint.
  if (!url.endsWith("/api/chat")) {
    return originalFetch(input, init);
  }

  try {
    if (!init.body || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    const payload = JSON.parse(init.body);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage || !isMarketQuestion(latestUserMessage.content)) {
      return originalFetch(input, init);
    }

    console.log("[Market Context] Market question detected. Fetching live data...");

    const marketResponse = await originalFetch(
      `${MARKET_API_BASE_URL}/api/consensus`,
      { method: "GET", headers: { Accept: "application/json" } },
    );

    if (!marketResponse.ok) {
      console.warn("[Market Context] Market API returned", marketResponse.status);
      return originalFetch(input, init);
    }

    const marketData = await marketResponse.json();
    const marketContext = buildMarketContext(marketData);

    const existingSystemIndex = messages.findIndex(
      (message) => message.role === "system",
    );

    if (existingSystemIndex >= 0) {
      messages[existingSystemIndex] = {
        ...messages[existingSystemIndex],
        content: `${messages[existingSystemIndex].content}\n\n${marketContext}`,
      };
    } else {
      messages.unshift({ role: "system", content: marketContext });
    }

    const newInit = {
      ...init,
      body: JSON.stringify({ ...payload, messages }),
    };

    return originalFetch(input, newInit);
  } catch (error) {
    console.warn("[Market Context] Could not add market data:", error);
    // Never break normal Ollama chat if the market service is unavailable.
    return originalFetch(input, init);
  }
};

console.log("[Market Context] Enabled. Market questions will use live market data.");
