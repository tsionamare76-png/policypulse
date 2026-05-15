const https = require("https");

exports.handler = async function (event, context) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }),
    };
  }

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: `You are a policy news analyst. Search the web for the most important CURRENT federal and state government headlines about:

1. METHANE: EPA regulations, methane emissions rules, natural gas policy, methane leak rules, oil & gas methane regulations
2. AI & DATACENTERS: federal or state AI legislation, AI executive orders, datacenter energy regulations, AI policy bills, data center permitting, AI safety laws

Find real, current headlines from the past 48 hours (today is ${today}).

Return ONLY a raw JSON array — no markdown fences, no explanation, no preamble. Just the array:
[{"topic":"methane","level":"Federal","title":"...","summary":"2-3 sentence explanation of what happened and why it matters.","source":"Publication name","url":"https://...","date":"May 15, 2026"}]

Rules: topic must be "methane" or "ai". level must be "Federal" or "State". Only government/regulatory/legislative articles. Up to 4 per topic. Return [] if nothing found.`,
      },
    ],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            resolve({
              statusCode: res.statusCode,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ error: parsed.error?.message || "API error" }),
            });
            return;
          }

          let jsonText = "";
          for (const block of parsed.content || []) {
            if (block.type === "text" && block.text) { jsonText = block.text; break; }
          }

          const clean = jsonText.replace(/```json|```/g, "").trim();
          let articles = [];
          try { articles = JSON.parse(clean); }
          catch (e) {
            const match = clean.match(/\[[\s\S]*\]/);
            if (match) { try { articles = JSON.parse(match[0]); } catch (e2) {} }
          }

          resolve({
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(Array.isArray(articles) ? articles : []),
          });
        } catch (e) {
          resolve({
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to parse API response" }),
          });
        }
      });
    });

    req.on("error", (e) => {
      resolve({
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: e.message }),
      });
    });

    req.write(requestBody);
    req.end();
  });
};
