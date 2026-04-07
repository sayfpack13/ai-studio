import { Zap, Gauge, Sparkles, Square, RectangleHorizontal, RectangleVertical, Maximize } from "lucide-react";

// Aspect ratio presets
export const aspectRatioPresets = [
  { id: "1:1", label: "Square", ratio: "1:1", width: 1024, height: 1024, icon: Square },
  { id: "2:3", label: "Portrait", ratio: "2:3", width: 768, height: 1024, icon: RectangleVertical },
  { id: "3:2", label: "Landscape", ratio: "3:2", width: 1024, height: 768, icon: RectangleHorizontal },
  { id: "16:9", label: "Widescreen", ratio: "16:9", width: 1280, height: 720, icon: Maximize },
];

// Quality presets for standard models
export const qualityPresets = {
  fast: {
    id: "fast",
    label: "Fast",
    description: "Quick generation",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-600/20",
    borderColor: "ring-yellow-500",
    steps: 15,
    guidanceScale: 3,
    time: "~5s",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Good quality",
    icon: Gauge,
    color: "text-blue-400",
    bgColor: "bg-blue-600/20",
    borderColor: "ring-blue-500",
    steps: 30,
    guidanceScale: 7.5,
    time: "~15s",
  },
  quality: {
    id: "quality",
    label: "Quality",
    description: "Best results",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/20",
    borderColor: "ring-purple-500",
    steps: 50,
    guidanceScale: 12,
    time: "~30s",
  },
};

// Z-Image quality presets
export const zImageQualityPresets = {
  fast: {
    id: "fast",
    label: "Fast",
    description: "Quick generation",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-600/20",
    borderColor: "ring-yellow-500",
    params: { numInferenceSteps: 15, guidanceScale: 3, shift: 3 },
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Good quality",
    icon: Gauge,
    color: "text-blue-400",
    bgColor: "bg-blue-600/20",
    borderColor: "ring-blue-500",
    params: { numInferenceSteps: 25, guidanceScale: 5, shift: 5 },
  },
  high: {
    id: "high",
    label: "High Quality",
    description: "Best results",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/20",
    borderColor: "ring-purple-500",
    params: { numInferenceSteps: 40, guidanceScale: 8, shift: 8 },
  },
};

// Image model configurations
export const imageModelConfigs = {
  // Generic/standard models (OpenAI, Stability, etc.)
  default: {
    id: "default",
    name: "Standard",
    supportsWidthHeight: true,
    supportsSteps: true,
    supportsGuidanceScale: true,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsQualityPresets: true,
    defaultValues: {
      width: 1024,
      height: 1024,
      steps: 30,
      guidanceScale: 7.5,
      negativePrompt: "",
    },
    ranges: {
      width: { min: 256, max: 2048 },
      height: { min: 256, max: 2048 },
      steps: { min: 10, max: 100 },
      guidanceScale: { min: 1, max: 20 },
    },
  },

  // Z-Image Turbo
  "chutes/z-image-turbo": {
    id: "chutes/z-image-turbo",
    name: "Z-Image Turbo",
    supportsWidthHeight: true,
    supportsSteps: true,
    supportsGuidanceScale: true,
    supportsShift: true,
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsQualityPresets: true,
    qualityPresets: zImageQualityPresets,
    defaultValues: {
      width: 1024,
      height: 1024,
      numInferenceSteps: 25,
      guidanceScale: 5,
      shift: 5,
      seed: "",
    },
    ranges: {
      width: { min: 256, max: 2048 },
      height: { min: 256, max: 2048 },
      numInferenceSteps: { min: 10, max: 50 },
      guidanceScale: { min: 1, max: 15 },
      shift: { min: 1, max: 15 },
    },
    sizePresets: [
      { id: "square", label: "Square", width: 1024, height: 1024 },
      { id: "portrait", label: "Portrait", width: 768, height: 1024 },
      { id: "landscape", label: "Landscape", width: 1024, height: 768 },
      { id: "widescreen", label: "Widescreen", width: 1280, height: 720 },
    ],
  },

  // Hunyuan Image 3
  "chutes/hunyuan-image-3": {
    id: "chutes/hunyuan-image-3",
    name: "Hunyuan Image 3",
    supportsSize: true, // Uses "1024x1024" format
    supportsSteps: true,
    supportsWidthHeight: false,
    supportsGuidanceScale: false,
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsQualityPresets: false,
    defaultValues: {
      size: "1024x1024",
      steps: 20,
      seed: "",
    },
    ranges: {
      steps: { min: 10, max: 50 },
    },
    sizePresets: [
      { id: "1024x1024", label: "1024x1024" },
      { id: "768x1024", label: "768x1024" },
      { id: "1024x768", label: "1024x768" },
      { id: "1280x720", label: "1280x720" },
    ],
  },

  // Qwen Image
  "chutes/Qwen-Image-2512": {
    id: "chutes/Qwen-Image-2512",
    name: "Qwen Image",
    supportsWidthHeight: true,
    supportsSteps: true,
    supportsCfgScale: true,
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsQualityPresets: false,
    defaultValues: {
      width: 1024,
      height: 1024,
      numInferenceSteps: 30,
      trueCfgScale: 4,
      negativePrompt: "",
      seed: "",
    },
    ranges: {
      width: { min: 128, max: 2048 },
      height: { min: 128, max: 2048 },
      numInferenceSteps: { min: 15, max: 50 },
      trueCfgScale: { min: 1, max: 10 },
    },
    sizePresets: [
      { id: "square", label: "Square", width: 1024, height: 1024 },
      { id: "portrait", label: "Portrait", width: 768, height: 1024 },
      { id: "landscape", label: "Landscape", width: 1024, height: 768 },
    ],
  },
};

// Get config for a model, falling back to default
export function getModelConfig(modelId) {
  return imageModelConfigs[modelId] || imageModelConfigs.default;
}

// Video model configurations
export const videoModelConfigs = {
  default: {
    id: "default",
    name: "Standard Video",
    supportsDuration: true,
    supportsFps: true,
    supportsResolution: true,
    defaultValues: {
      duration: 5,
      fps: 24,
      width: 1280,
      height: 720,
    },
    ranges: {
      duration: { min: 3, max: 15 },
      fps: { min: 12, max: 60 },
      width: { min: 320, max: 1920 },
      height: { min: 240, max: 1080 },
    },
  },
};

export function getVideoModelConfig(modelId) {
  return videoModelConfigs[modelId] || videoModelConfigs.default;
}

// Music model configurations
export const musicModelConfigs = {
  default: {
    id: "default",
    name: "Standard Music",
    supportsDuration: true,
    supportsFormat: true,
    supportsStyle: true,
    defaultValues: {
      duration: 30,
      format: "wav",
      style: "ambient",
    },
    ranges: {
      duration: { min: 5, max: 120 },
    },
    formatPresets: [
      { id: "wav", label: "WAV" },
      { id: "mp3", label: "MP3" },
    ],
    stylePresets: [
      { id: "ambient", label: "Ambient" },
      { id: "electronic", label: "Electronic" },
      { id: "classical", label: "Classical" },
    ],
  },
};

export function getMusicModelConfig(modelId) {
  return musicModelConfigs[modelId] || musicModelConfigs.default;
}
