---
title: AI Studio - Image & Video Generation
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: "5.0.0"
app_file: app.py
pinned: false
license: mit
hardware: zero-a10g
---

# AI Studio – Image & Video Generation Space

Single HuggingFace Space with ZeroGPU that provides:

- **Image generation** via FLUX.1-schnell (4-step fast generation)
- **Video generation** via Wan 2.1 I2V 14B 480P (image-to-video)

## API Endpoints

### `/generate_image`
- `prompt` (str): Text prompt
- `width` (int): Image width (default 1024)
- `height` (int): Image height (default 1024)
- `num_inference_steps` (int): Steps (default 4)
- `guidance_scale` (float): Guidance (default 0.0 for schnell)
- `seed` (int): Seed, -1 for random

### `/generate_video`
- `image` (PIL Image): Input image
- `prompt` (str): Motion/scene prompt
- `negative_prompt` (str): Negative prompt
- `width` (int): Video width (default 832)
- `height` (int): Video height (default 480)
- `num_frames` (int): Frame count 17-81 (default 81)
- `guidance_scale` (float): Guidance (default 5.0)
- `num_inference_steps` (int): Steps (default 25)
- `seed` (int): Seed, -1 for random
