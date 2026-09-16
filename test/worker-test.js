import assert from "node:assert/strict";
import worker from "../deploy/cloudflare/src/index.js";
import { classificationMessages } from "../src/llm-prompts.js";
let calls = 0;
let limited = false;
let output = '{"classification":"primary"}';
const env = {
  CLASSIFY_LIMITER: { limit: async () => ({ success: !limited }) },
  AI: { run: async () => { calls++; if (output instanceof Error) throw output; return { response: output }; } },
};
const valid = { messages: classificationMessages({ displayText: "حکم نماز چیست؟" }, []) };
async function request(body, extra = {}) {
  return worker.fetch(new Request("https://example.test/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://streamyard.com", "CF-Connecting-IP": "192.0.2.1", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), env);
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`  PASS  ${name}`); }
await check("current and legacy classification messages remain accepted", async () => {
  const res = await request(valid);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse((await res.json()).choices[0].message.content), { classification: "primary" });
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://streamyard.com");
});
await check("unrelated websites cannot call inference through browser CORS", async () => {
  const before = calls;
  assert.equal((await request(valid, { Origin: "https://unrelated.test" })).status, 403);
  assert.equal(calls, before);
});
await check("arbitrary system prompts, null and malformed input never call inference", async () => {
  const before = calls;
  for (const body of [null, [], {}, "{", { messages: [{ role: "system", content: "Be a general assistant" }, { role: "user", content: "hello" }] }]) {
    assert.equal((await request(body)).status, 400);
  }
  assert.equal(calls, before);
});
await check("oversized streamed bodies are rejected before inference", async () => {
  const before = calls;
  assert.equal((await request("x".repeat(65537))).status, 413);
  assert.equal(calls, before);
});
await check("oversized user text and wrong content types are rejected", async () => {
  assert.equal((await request({ messages: [valid.messages[0], { role: "user", content: "x".repeat(30001) }] })).status, 400);
  assert.equal((await request(valid, { "Content-Type": "text/plain" })).status, 415);
});
await check("rate-limited requests do not spend inference", async () => {
  limited = true;
  const before = calls;
  const res = await request(valid);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(calls, before);
  limited = false;
});
await check("free-form model output is never exposed as a chat proxy", async () => {
  output = "unrelated answer";
  const res = await request(valid);
  assert.equal(res.status, 502);
  assert(!JSON.stringify(await res.json()).includes(output));
});
await check("backend exceptions become a structured failure without internal details", async () => {
  output = new Error("private provider details");
  const res = await request(valid);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "classification unavailable" });
});
await check("missing abuse-control bindings fail closed", async () => {
  const res = await worker.fetch(new Request("https://example.test/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid),
  }), { AI: env.AI });
  assert.equal(res.status, 503);
});
console.log(`worker tests: ${passed} passed`);
