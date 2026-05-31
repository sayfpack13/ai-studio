import dotenv from "dotenv";
dotenv.config();

const key = process.env.ACEMUSIC_API_KEY;
const base = (process.env.ACEMUSIC_BASE_URL || "https://api.acemusic.ai").replace(/\/+$/, "");

const paths = [
  ["GET", "/health"],
  ["POST", "/release_task", "{}"],
  ["POST", "/query_result", JSON.stringify({ task_id_list: [] })],
  ["GET", "/v1/models"],
];

for (const [method, p, body] of paths) {
  try {
    const r = await fetch(base + p, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: method === "POST" ? body : undefined,
    });
    const text = (await r.text()).slice(0, 150).replace(/\s+/g, " ");
    console.log(p, r.status, text);
  } catch (e) {
    console.log(p, "ERR", e.message);
  }
}
