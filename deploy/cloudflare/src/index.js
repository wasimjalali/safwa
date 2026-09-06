const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Safwa Privacy Policy</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 44rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.6; color: #14221c; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.8rem; }
  .updated { color: #4a534e; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>Safwa Privacy Policy</h1>
<p class="updated">Last updated: 6 September 2026</p>

<p>Safwa is a browser extension that helps a presenter read a live StreamYard Q&amp;A comment feed: it collapses duplicate questions, merges questions split across two comments, and flags second questions from the same person. This policy explains exactly what data the extension touches.</p>

<h2>What the extension processes</h2>
<ul>
<li><strong>Website content (StreamYard comment feed):</strong> the extension reads the comments visible on the StreamYard studio page in your browser, including author names and comment text, to detect duplicates and continuations.</li>
<li><strong>Personal communications (comment text):</strong> when a comment is ambiguous, its text may be sent to the developer's own classification endpoint (this Worker, <code>safwa-llm.karko-ai.workers.dev</code>), which runs a language model to decide whether two comments ask the same question. This is the only network request the extension makes.</li>
<li><strong>Local preference:</strong> the on/off state of the filter is saved in your browser's local extension storage. It never leaves your browser.</li>
</ul>

<h2>What we do not do</h2>
<ul>
<li>We do not store comment text. The classification endpoint is stateless: it receives text, returns a yes/no classification, and keeps nothing.</li>
<li>We do not sell data, share it with third parties, or use it for advertising or any purpose unrelated to the filtering function.</li>
<li>We do not collect browsing history, contacts, or identifying information. The developer never sees who wrote a comment; the extension sends text only.</li>
<li>We do not collect analytics or telemetry.</li>
</ul>

<h2>Who processes the data</h2>
<p>Classification is performed by Cloudflare Workers AI (Cloudflare, Inc.) on the developer's own Worker. No other third party receives comment text.</p>

<h2>Control</h2>
<p>The extension's toolbar switch turns filtering (and therefore all reading and classification) off instantly. The extension only runs on <code>streamyard.com</code> pages.</p>

<h2>Contact</h2>
<p>Wasim Jalali &mdash; <a href="mailto:jalaliwasim15@gmail.com">jalaliwasim15@gmail.com</a></p>
</body>
</html>`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/privacy") {
      return new Response(PRIVACY_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

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
