---
title: AI Studio - Image & Video Generation
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: "5.29.0"
app_file: app.py
pinned: false
private: true
license: mit
---

# AI Studio – Image & Video Generation Space

Single HuggingFace Space with ZeroGPU that provides:

- **Image generation** via FLUX.2-dev (remote text encoder + local denoising)
- **Image-to-image editing** via FLUX.2-dev (optional reference images)
- **Video generation** via Wan 2.2 I2V A14B (image-to-video, CPU pre-encoded)

## ZeroGPU Cost Optimization

- **FLUX.2-dev**: Uses `Flux2Pipeline` with `text_encoder=None` and `tokenizer=None`; prompt embeddings are computed by `multimodalart/mistral-text-encoder`
- **Wan I2V**: Text (T5) and image (CLIP) encoding run on CPU before `@spaces.GPU` — GPU only for transformer denoising + VAE decode
- **Module-level loading**: Models loaded at import time, ZeroGPU intercepts `.to("cuda")` and defers allocation
- **Dynamic GPU duration**: Duration scales with steps/resolution instead of fixed timeout

## API Endpoints

### `/infer` (Image Generation)
- `prompt` (str): Text prompt
- `input_images` (list[PIL], optional): Reference images for I2I editing
- `seed` (int): Seed, -1 for random
- `randomize_seed` (bool): Randomize seed (default true)
- `width` (int): Image width (default 1024)
- `height` (int): Image height (default 1024)
- `num_inference_steps` (int): Steps (default 30)
- `guidance_scale` (float): Guidance (default 4.0)

### `/generate_video` (Video Generation)
- `image` (PIL Image): Input image
- `prompt` (str): Motion/scene prompt
- `negative_prompt` (str): Negative prompt
- `width` (int): Video width (default 832)
- `height` (int): Video height (default 480)
- `num_frames` (int): Frame count 17-81 (default 81)
- `guidance_scale` (float): Guidance (default 3.5)
- `num_inference_steps` (int): Steps (default 40)
- `seed` (int): Seed, -1 for random
