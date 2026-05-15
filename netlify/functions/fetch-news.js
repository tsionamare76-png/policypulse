const https = require("https");

function makeRequest(apiKey, body) {
  return new Promise((resolve) => {
    const requestBody = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", (e) => resolve({ status: 500, body: JSON.stringify({ error: e.message }) }));
    req.write(requestBody);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArticles(responseBody) {
  try {
    const parsed = JSON.parse(responseBody);
    let jsonText = "";
    for (const block of parsed.content || []) {
      if (block.type === "text" && block.text) { jsonText = block.text; break; }
    }
    const clean = jsonText.replace(/```json|```/g, "").trim();
    try { return JSON.parse(clean); } catch(e) {
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) { try { return JSON.parse(match[0]); } catch(e2) {} }
    }
  } catch(e) {}
  return [];
}

exports.handler = async function (event, context) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set." }) };
  }

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Two batched searches to stay under rate limits
  const searches = [
    {
      prompt: `Find 2 recent US gov news headlines each on: methane/EPA rules (topic="methane"), AI/datacenter legislation (topic="ai"), Texas energy/ERCOT policy (topic="texas"). Today: ${today}. JSON only, no markdown: [{"topic":"methane","level":"Federal","title":"...","summary":"1 sentence.","source":"...","url":"https://...","date":"..."}]. level="Federal" or "State". Return [].`
    },
    {
      prompt: `Find 2 recent US gov news headlines each on: power grid reliability/electricity demand (topic="grid"), clean energy/solar/wind/IRA policy (topic="clean"), oil and gas regulation/LNG (topic="oilgas"). Today: ${today}. JSON only, no markdown: [{"topic":"grid","level":"Federal","title":"...","summary":"1 sentence.","source":"...","url":"https://...","date":"..."}]. level="Federal" or "State". Return [].`
    }
  ];

  let allArticles = [];

  for (const search of searches) {
    try {
      await sleep(600);
      const result = await makeRequest(ANTHROPIC_API_KEY, {
        model: "claude-haiku-4-5",
        max_tokens: 700,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: search.prompt }],
      });
      if (result.status === 200) {
        const articles = parseArticles(result.body);
        if (Array.isArray(articles)) allArticles = allArticles.concat(articles);
      }
    } catch(e) {}
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(allArticles),
  };
};
