const fs = require('fs');

let content = fs.readFileSync('server/routes/video.js', 'utf8');

const regex = /\/\/ ── HuggingFace Gradio Space \(video\) ──────────────────────────────[\s\S]*?\}\n    \}/m;

// Because powershell garbles unicode sometimes, we will just use a simpler regex
