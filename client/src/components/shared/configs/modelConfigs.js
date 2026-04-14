import { Zap, Gauge, Sparkles, Square, RectangleHorizontal, RectangleVertical, Maximize } from "lucide-react";

// Aspect ratio presets
export const aspectRatioPresets = [
  { id: "1:1", label: "Square", ratio: "1:1", width: 1024, height: 1024, icon: Square },
  { id: "4:3", label: "Classic", ratio: "4:3", width: 1024, height: 768, icon: RectangleHorizontal },
  { id: "2:3", label: "Portrait", ratio: "2:3", width: 768, height: 1152, icon: RectangleVertical },
  { id: "3:4", label: "Tall", ratio: "3:4", width: 864, height: 1152, icon: RectangleVertical },
  { id: "3:2", label: "Landscape", ratio: "3:2", width: 1152, height: 768, icon: RectangleHorizontal },
  { id: "2:1", label: "Panorama", ratio: "2:1", width: 1280, height: 640, icon: Maximize },
  { id: "1:2", label: "Vertical Panorama", ratio: "1:2", width: 640, height: 1280, icon: RectangleVertical },
  { id: "16:9", label: "Widescreen", ratio: "16:9", width: 1280, height: 720, icon: Maximize },
  { id: "9:16", label: "Mobile", ratio: "9:16", width: 720, height: 1280, icon: RectangleVertical },
  { id: "21:9", label: "Cinema", ratio: "21:9", width: 1344, height: 576, icon: Maximize },
  { id: "9:21", label: "Tall Cinema", ratio: "9:21", width: 576, height: 1344, icon: RectangleVertical },
  { id: "16:10", label: "Desktop", ratio: "16:10", width: 1280, height: 800, icon: RectangleHorizontal },
  { id: "10:16", label: "Vertical Desktop", ratio: "10:16", width: 800, height: 1280, icon: RectangleVertical },
  { id: "16:3", label: "Ultra Wide", ratio: "16:3", width: 1536, height: 288, icon: Maximize },
  { id: "3:16", label: "Ultra Tall", ratio: "3:16", width: 288, height: 1536, icon: RectangleVertical },
  { id: "8:3", label: "Wide Banner", ratio: "8:3", width: 1536, height: 576, icon: Maximize },
  { id: "3:8", label: "Tall Banner", ratio: "3:8", width: 576, height: 1536, icon: RectangleVertical },
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

// Tongyi Z-Image Turbo quality presets
export const tongyiQualityPresets = {
  fast: {
    id: "fast",
    label: "Fast",
    description: "Lower latency",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-600/20",
    borderColor: "ring-yellow-500",
    params: { steps: 6, shift: 2 },
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Recommended",
    icon: Gauge,
    color: "text-blue-400",
    bgColor: "bg-blue-600/20",
    borderColor: "ring-blue-500",
    params: { steps: 8, shift: 3 },
  },
  high: {
    id: "high",
    label: "High Quality",
    description: "More detail",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/20",
    borderColor: "ring-purple-500",
    params: { steps: 12, shift: 4 },
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
      { id: "cinema", label: "Cinema", width: 1344, height: 576 },
      { id: "mobile", label: "Mobile", width: 720, height: 1280 },
      { id: "ultra-wide", label: "Ultra Wide 16:3", width: 1536, height: 288 },
      { id: "wide-banner", label: "Wide Banner 8:3", width: 1536, height: 576 },
      { id: "ultra-tall", label: "Ultra Tall 3:16", width: 288, height: 1536 },
      { id: "tall-banner", label: "Tall Banner 3:8", width: 576, height: 1536 },
    ],
  },

  // FLUX.1-dev (HuggingFace Space)
  "huggingface/black-forest-labs/FLUX.1-dev": {
    id: "huggingface/black-forest-labs/FLUX.1-dev",
    name: "FLUX.1-dev",
    supportsSize: true,
    supportsWidthHeight: true,
    supportsSteps: true,
    supportsGuidanceScale: true,
    supportsShift: false,
    supportsNegativePrompt: false, // FLUX doesn't normally use negative prompt in the API call
    supportsSeed: true,
    supportsRandomSeed: true,
    supportsQualityPresets: false,
    defaultValues: {
      width: 1024,
      height: 1024,
      steps: 28,
      guidanceScale: 3.5,
      seed: 0,
      randomSeed: true,
    },
    ranges: {
      width: { min: 256, max: 2048 },
      height: { min: 256, max: 2048 },
      steps: { min: 1, max: 50 },
      guidanceScale: { min: 1, max: 15, step: 0.1 },
    },
  },

  // Tongyi Z-Image Turbo (HuggingFace Space / API)
  "huggingface/Tongyi-MAI/Z-Image-Turbo": {
    id: "huggingface/Tongyi-MAI/Z-Image-Turbo",
    name: "Tongyi Z-Image-Turbo",
    supportsSize: true,
    supportsWidthHeight: true,
    supportsSteps: true,
    supportsGuidanceScale: false,
    supportsShift: true,
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsRandomSeed: true,
    supportsQualityPresets: true,
    qualityPresets: tongyiQualityPresets,
    shiftLabel: "Time Shift",
    defaultValues: {
      size: "1024x1024 ( 1:1 )",
      width: 1024,
      height: 1024,
      steps: 8,
      shift: 3,
      seed: 42,
      randomSeed: true,
    },
    ranges: {
      width: { min: 256, max: 2048 },
      height: { min: 256, max: 2048 },
      steps: { min: 1, max: 100 },
      shift: { min: 1, max: 10 },
    },
    sizePresets: [
      { id: "square", label: "Square", description: "1024x1024 (1:1)", width: 1024, height: 1024 },
      { id: "portrait", label: "Portrait", description: "768x1024 (3:4)", width: 768, height: 1024 },
      { id: "landscape", label: "Landscape", description: "1024x768 (4:3)", width: 1024, height: 768 },
      { id: "mobile", label: "Mobile", description: "720x1280 (9:16)", width: 720, height: 1280 },
      { id: "widescreen", label: "Widescreen", description: "1280x720 (16:9)", width: 1280, height: 720 },
      { id: "cinema", label: "Cinema", description: "1344x576 (21:9)", width: 1344, height: 576 },
      { id: "tall-cinema", label: "Tall Cinema", description: "576x1344 (9:21)", width: 576, height: 1344 },
      { id: "desktop", label: "Desktop", description: "1280x800 (16:10)", width: 1280, height: 800 },
      { id: "vertical-desktop", label: "Vertical", description: "800x1280 (10:16)", width: 800, height: 1280 },
      { id: "ultra-wide", label: "Ultra Wide", description: "1536x288 (16:3)", width: 1536, height: 288 },
      { id: "wide-banner", label: "Wide Banner", description: "1536x576 (8:3)", width: 1536, height: 576 },
      { id: "ultra-tall", label: "Ultra Tall", description: "288x1536 (3:16)", width: 288, height: 1536 },
      { id: "tall-banner", label: "Tall Banner", description: "576x1536 (3:8)", width: 576, height: 1536 },
    ],
  },

  // Hunyuan Image 3
  "chutes/hunyuan-image-3": {
    id: "chutes/hunyuan-image-3",
    name: "Hunyuan Image 3",
    supportsSize: true, // Uses "1024x1024" format
    supportsSteps: true,
    supportsWidthHeight: true,
    supportsGuidanceScale: false,
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsQualityPresets: false,
    defaultValues: {
      size: "1024x1024",
      width: 1024,
      height: 1024,
      steps: 20,
      seed: "",
    },
    ranges: {
      width: { min: 256, max: 2048 },
      height: { min: 256, max: 2048 },
      steps: { min: 10, max: 50 },
    },
    sizePresets: [
      { id: "1024x1024", label: "1024x1024", width: 1024, height: 1024 },
      { id: "768x1024", label: "768x1024", width: 768, height: 1024 },
      { id: "1024x768", label: "1024x768", width: 1024, height: 768 },
      { id: "1280x720", label: "1280x720", width: 1280, height: 720 },
      { id: "720x1280", label: "720x1280", width: 720, height: 1280 },
      { id: "1344x576", label: "1344x576", width: 1344, height: 576 },
      { id: "576x1344", label: "576x1344", width: 576, height: 1344 },
      { id: "1536x288", label: "1536x288 (16:3)", width: 1536, height: 288 },
      { id: "1536x576", label: "1536x576 (8:3)", width: 1536, height: 576 },
      { id: "288x1536", label: "288x1536 (3:16)", width: 288, height: 1536 },
      { id: "576x1536", label: "576x1536 (3:8)", width: 576, height: 1536 },
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
      { id: "widescreen", label: "Widescreen", width: 1280, height: 720 },
      { id: "mobile", label: "Mobile", width: 720, height: 1280 },
      { id: "cinema", label: "Cinema", width: 1344, height: 576 },
      { id: "ultra-wide", label: "Ultra Wide 16:3", width: 1536, height: 288 },
      { id: "wide-banner", label: "Wide Banner 8:3", width: 1536, height: 576 },
      { id: "ultra-tall", label: "Ultra Tall 3:16", width: 288, height: 1536 },
      { id: "tall-banner", label: "Tall Banner 3:8", width: 576, height: 1536 },
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

  // Wan 2.2 I2V HuggingFace Space
  "huggingface/r3gm/wan2-2-fp8da-aoti-preview": {
    id: "huggingface/r3gm/wan2-2-fp8da-aoti-preview",
    name: "Wan 2.2 I2V (Fast)",
    supportsDuration: false,
    supportsFps: false,
    supportsWidthHeight: false, 
    supportsSteps: true,
    supportsCfgScale: true,
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsQualityPresets: false,
    defaultValues: {
      numInferenceSteps: 6,
      guidanceScale: 1.0,
      negativePrompt: "",
      seed: "",
    },
    ranges: {
      numInferenceSteps: { min: 6, max: 50 },
      guidanceScale: { min: 0.1, max: 20 },
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
