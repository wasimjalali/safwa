const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method === "GET") {
      return Response.json({ ok: true, model: MODEL }, { headers: CORS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400, headers: CORS });
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400, headers: CORS });
    }

    const result = await env.AI.run(MODEL, {
      messages,
      temperature: 0,
      max_tokens: 128,
      chat_template_kwargs: { enable_thinking: false },
    });

    if (result && Array.isArray(result.choices)) {
      return Response.json(
        { model: MODEL, choices: result.choices },
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const content =
      typeof result === "string"
        ? result
        : result?.response ||
          result?.result?.response ||
          result?.message?.content ||
          (typeof result?.result === "string" ? result.result : JSON.stringify(result ?? ""));

    return Response.json(
      {
        model: MODEL,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
          },
        ],
      },
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  },
};
