async function findApiEndpoints() {
  const base = "https://acemusic.ai";
  
  // Fetch main page
  const html = await fetch(base, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
  
  // Extract all script URLs
  const scriptUrls = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => {
    const url = m[1];
    return url.startsWith("http") ? url : url.startsWith("/") ? base + url : base + "/" + url;
  });
  
  console.log("Found", scriptUrls.length, "scripts");
  
  const endpoints = new Set();
  const patterns = [
    /https?:\/\/[^"'\s]+api[^"'\s]*/gi,
    /wss?:\/\/[^"'\s]+/gi,
    /["']\/(v1|api|release_task|query_result|ws)[^"'\s]*/gi,
    /["'](\/[^"'\s]*chat[^"'\s]*)["']/gi,
    /fetch\(["']([^"']+)["']/gi,
    /axios\.[a-z]+\(["']([^"']+)["']/gi,
  ];
  
  for (const url of scriptUrls.slice(0, 8)) {
    try {
      const js = await fetch(url, { 
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000)
      }).then(r => r.text());
      
      for (const pattern of patterns) {
        const matches = [...js.matchAll(pattern)];
        for (const m of matches) {
          endpoints.add(m[1] || m[0]);
        }
      }
      
      // Also look for specific API patterns
      if (js.includes("acemusic") || js.includes("api") || js.includes("chat/completions")) {
        console.log("\n=== Script:", url, "===");
        const lines = js.split("\n");
        for (const line of lines) {
          if (line.includes("api") || line.includes("acemusic") || line.includes("chat/completions") || line.includes("wss://")) {
            const trimmed = line.trim();
            if (trimmed.length < 300) console.log(trimmed);
          }
        }
      }
    } catch (e) {
      console.log("Failed:", url, e.message);
    }
  }
  
  console.log("\n=== All found endpoints ===");
  for (const ep of [...endpoints].sort()) {
    console.log(ep);
  }
}

findApiEndpoints().catch(console.error);
