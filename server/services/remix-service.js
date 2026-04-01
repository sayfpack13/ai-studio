import axios from "axios";

function extractAudioUrl(value, depth = 0) {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const match = value.match(/https?:\/\/\S+/i);
    return match ? match[0] : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAudioUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      const found = extractAudioUrl(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function buildPrompt({
  prompt,
  style,
  genre,
  tempo,
  weirdness,
  influence,
  preserveVocals,
}) {
  const parts = [prompt?.trim() || "Remix this audio track"];
  if (style) parts.push(`Style: ${style}`);
  if (genre) parts.push(`Genre: ${genre}`);
  if (tempo) parts.push(`Tempo adjustment: ${tempo}`);
  if (Number.isFinite(Number(weirdness))) {
    parts.push(`Weirdness: ${Number(weirdness)} / 100`);
  }
  if (Number.isFinite(Number(influence))) {
    parts.push(`Style influence: ${Number(influence)} / 100`);
  }
  if (typeof preserveVocals === "boolean") {
    parts.push(`Preserve vocals: ${preserveVocals ? "yes" : "no"}`);
  }
  return parts.join(". ");
}

export function getDefaultVoices() {
  return [
    { id: "cinematic", label: "Cinematic" },
    { id: "electronic", label: "Electronic" },
    { id: "lofi", label: "Lo-Fi" },
    { id: "orchestral", label: "Orchestral" },
    { id: "vocal-pop", label: "Vocal Pop" },
  ];
}

export async function remixTrack({
  providerContext,
  modelId,
  sourceAudioUrl,
  sourceAudioBase64,
  remixOptions = {},
}) {
  const provider = providerContext.provider;
  const providerId = providerContext.providerId;
  const apiKey = provider.apiKey;
  const apiBaseUrl = provider.apiBaseUrl;
  const timeout = provider.timeout?.video || 300000;

  if (!sourceAudioUrl && !sourceAudioBase64) {
    throw new Error("Source audio is required");
  }

  if (providerId === "ollama") {
    return {
      success: true,
      data: [
        {
          url: sourceAudioUrl || `data:audio/wav;base64,${sourceAudioBase64}`,
          revised_prompt: buildPrompt(remixOptions),
          note: "Ollama remix returns passthrough sample in this build",
        },
      ],
    };
  }

  const prompt = buildPrompt(remixOptions);
  const content = [
    { type: "text", text: prompt },
    ...(sourceAudioUrl
      ? [{ type: "audio_url", audio_url: { url: sourceAudioUrl } }]
      : [{ type: "input_audio", input_audio: { data: sourceAudioBase64 } }]),
  ];

  const response = await axios.post(
    `${apiBaseUrl}/chat/completions`,
    {
      model: modelId,
      messages: [{ role: "user", content }],
      ...(remixOptions.voice ? { voice: remixOptions.voice } : {}),
      format: remixOptions.format || "mp3",
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout,
    },
  );

  const raw = response.data;
  const contentText = raw?.choices?.[0]?.message?.content;
  const extracted = extractAudioUrl(contentText || raw);

  return {
    success: true,
    data: [
      {
        url: extracted || contentText,
        raw: contentText || raw,
        revised_prompt: prompt,
      },
    ],
  };
}
