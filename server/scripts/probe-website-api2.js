async function findApiEndpoints() {
  const base = "https://acemusic.ai";
  
  const html = await fetch(base, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
  
  // Search for any URLs in the HTML
  const allUrls = [...html.matchAll(/https?:\/\/[^"'<>\s]+/g)].map(m => m[0]);
  console.log("=== URLs in HTML ===");
  for (const url of [...new Set(allUrls)].sort()) {
    if (url.includes("api") || url.includes("acemusic") || url.includes("ws")) {
      console.log(url);
    }
  }
  
  // Search for config objects
  const configMatches = [...html.matchAll(/window\.__[A-Z_]+__\s*=\s*({[^}]+})/g)];
  for (const m of configMatches) {
    console.log("\n=== Config object ===");
    console.log(m[0].slice(0, 500));
  }
  
  // Search for inline scripts
  const inlineScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for (const m of inlineScripts) {
    const script = m[1];
    if (script.includes("api") || script.includes("acemusic") || script.includes("ws")) {
      console.log("\n=== Inline script match ===");
      console.log(script.slice(0, 500));
    }
  }
  
  // Try WebSocket endpoints
  const wsUrls = [
    "wss://api.acemusic.ai/v1/chat/completions",
    "wss://api.acemusic.ai",
    "wss://acemusic.ai",
  ];
  
  console.log("\n=== WebSocket tests ===");
  for (const wsUrl of wsUrls) {
    try {
      const ws = new WebSocket(wsUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = () => { console.log(wsUrl, "OPEN"); ws.close(); resolve(); };
        ws.onerror = (e) => { console.log(wsUrl, "ERROR"); resolve(); };
        setTimeout(() => { console.log(wsUrl, "TIMEOUT"); resolve(); }, 3000);
      });
    } catch (e) {
      console.log(wsUrl, "ERR", e.message);
    }
  }
}

findApiEndpoints().catch(console.error);
