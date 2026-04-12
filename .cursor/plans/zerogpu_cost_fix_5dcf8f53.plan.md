---
name: ZeroGPU Cost Fix
overview: "Move model loading outside @spaces.GPU so ZeroGPU is only charged for inference, not model loading. Current code loads models lazily inside @spaces.GPU which costs ~120s of GPU time per first call. Fix: load at module level on CPU, use CPU offload, only GPU for inference."
todos:
  - id: module-load
    content: "Rewrite app.py: load models at module level, remove lazy-load, use enable_model_cpu_offload()"
    status: pending
  - id: requirements
    content: "Update requirements.txt: remove torchao"
    status: pending
  - id: deploy
    content: Re-deploy Space and verify it starts correctly without loading inside GPU
    status: pending
isProject: false
---

## Problem
Current code loads models lazily inside `@spaces.GPU` decorated functions. Every second of model downloading, checkpoint loading, and weight initialization is charged as ZeroGPU time. This costs ~120s for FLUX and ~300s for Wan on the first call.

## Solution
Load models at **module level** (on CPU, before any GPU is allocated). ZeroGPU intercepts `.to('cuda')` calls and defers them. Use `enable_model_cpu_offload()` so model components stay in CPU RAM and are moved to GPU only during inference.

## Changes

### `huggingface-space/app.py` - Revert lazy loading to module-level loading

Current (broken - loads inside @spaces.GPU):
```python
flux_pipe = None
wan_pipe = None

@spaces.GPU(duration=120)
def generate_image(...):
    pipe = _load_flux()  # <-- costs GPU time on first call
```

New (fixed - loads at module level):
```python
flux_pipe = FluxPipeline.from_pretrained(...).to('cuda')  # deferred by spaces
flux_pipe.enable_model_cpu_offload()

wan_pipe = WanImageToVideoPipeline.from_pretrained(...).to('cuda')  # deferred by spaces
wan_pipe.enable_model_cpu_offload()

@spaces.GPU(duration=120)
def generate_image(...):
    result = flux_pipe(...)  # <-- only inference costs GPU time
```

Key changes:
1. Remove `_load_flux()` / `_load_wan()` lazy-load functions
2. Load pipelines at module level with `.to('cuda')` -- `spaces` intercepts this and defers GPU allocation
3. Use `enable_model_cpu_offload()` so weights stay in CPU RAM, moved to GPU only during forward pass
4. `@spaces.GPU(duration=120)` for image, `@spaces.GPU(duration=300)` for video (Wan is heavier)
5. Remove `torchao` from requirements (not compatible with torch 2.9.1)
6. Keep `enable_sequential_cpu_offload()` or switch to `enable_model_cpu_offload()` - the latter is better for ZeroGPU since it keeps more in RAM and only moves components to GPU when needed

### `huggingface-space/requirements.txt` - Remove torchao
Keep everything else the same, remove `torchao` line.

## Cost comparison

| Action | Before | After |
|--------|--------|-------|
| Model loading | ~120s GPU time (FLUX) + ~300s GPU time (Wan) | 0s GPU time (loaded on CPU) |
| First FLUX inference | ~130s GPU total | ~15s GPU (model offload + inference) |
| Subsequent FLUX | ~10s GPU | ~5s GPU (cached) |
| First Wan inference | ~360s GPU total | ~30s GPU (model offload + inference) |
| Subsequent Wan | ~60s GPU | ~25s GPU |

This approach uses the same pattern as the official HuggingFace `zerogpu-aoti` reference spaces (e.g., the FLUX demo loads at module level with `.to('cuda')`).