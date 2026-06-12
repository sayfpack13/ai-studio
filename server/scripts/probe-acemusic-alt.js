import dotenv from "dotenv";
dotenv.config();

const key = process.env.ACEMUSIC_API_KEY;

const bases = [
  "https://api.acemusic.ai",
  "https://ai.acemusic.ai",
  "https://acemusic.ai",
  "https://acemusic.ai/api",
];

const paths = [
  ["GET", "/health"],
  ["POST", "/release_task", "{}"],
  ["POST", "/query_result", JSON.stringify({ task_id_list: [] })],
  ["GET", "/v1/models"],
];

for (const base of bases) {
  console.log(`\n=== ${base} ===`);
  for (const [method, p, body] of paths) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const r = await fetch(base + p, {
        method,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: method === "POST" ? body : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = (await r.text()).slice(0, 120).replace(/\s+/g, " ");
      console.log(p, r.status, text);
    } catch (e) {
      console.log(p, "ERR", e.name === "AbortError" ? "timeout" : e.message);
    }
  }
}
