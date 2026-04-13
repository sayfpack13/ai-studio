import os
import spaces
import torch
import numpy as np
import gradio as gr
from PIL import Image
from diffusers import Flux2Pipeline, Flux2Transformer2DModel, WanImageToVideoPipeline
from diffusers.utils import export_to_video
from gradio_client import Client as GradioClient

# ---------------------------------------------------------------------------
# Persistent storage: use HF Bucket mount if available, otherwise /tmp
# The bucket mount path is /data by default on HuggingFace Spaces
# ---------------------------------------------------------------------------
DATA_DIR = os.environ.get("DATA_DIR", "/data")
HAS_PERSISTENT_STORAGE = os.path.isdir(DATA_DIR) and os.access(DATA_DIR, os.W_OK)
if HAS_PERSISTENT_STORAGE:
    HF_CACHE_DIR = os.path.join(DATA_DIR, "hf_cache")
    os.makedirs(HF_CACHE_DIR, exist_ok=True)
    os.environ["HF_HOME"] = HF_CACHE_DIR
    os.environ["HUGGINGFACE_HUB_CACHE"] = HF_CACHE_DIR
else:
    HF_CACHE_DIR = None

# ---------------------------------------------------------------------------
# Authentication: read HF token from Space Secrets for gated models
# Add "HF_TOKEN" as a Secret in your Space Settings on HuggingFace.
# ---------------------------------------------------------------------------
HF_TOKEN = os.environ.get("HF_TOKEN")

# ===========================================================================
# FLUX.2-dev — Maximum ZeroGPU cost savings setup
#
# - Load only transformer + core pipeline at module import
# - Skip local text stack (tokenizer/text_encoder) to avoid extra loading + Pixtral
#   placeholder issues; prompts are encoded remotely.
# - Run only diffusion denoising on GPU.
# ===========================================================================

print("[FLUX] Loading FLUX.2-dev transformer...")
flux_transformer = Flux2Transformer2DModel.from_pretrained(
    "black-forest-labs/FLUX.2-dev",
    subfolder="transformer",
    torch_dtype=torch.bfloat16,
    cache_dir=HF_CACHE_DIR,
    token=HF_TOKEN,
)

print("[FLUX] Loading FLUX.2-dev pipeline (remote text encoder mode)...")
flux_pipe = Flux2Pipeline.from_pretrained(
    "black-forest-labs/FLUX.2-dev",
    transformer=flux_transformer,
    text_encoder=None,
    tokenizer=None,
    torch_dtype=torch.bfloat16,
    cache_dir=HF_CACHE_DIR,
    token=HF_TOKEN,
)
flux_pipe.to("cuda")  # ZeroGPU intercepts this — no GPU allocated until inference

# Try loading pre-compiled AOTI blocks for faster inference (optional optimization)
try:
    if hasattr(flux_pipe, "transformer"):
        spaces.aoti_blocks_load(flux_pipe.transformer, "zerogpu-aoti/FLUX.2", variant="fa3")
        print("[FLUX] AOTI blocks loaded successfully.")
except Exception as e:
    print(f"[FLUX] AOTI blocks not available (non-critical): {e}")

print("[FLUX] FLUX.2-dev loaded.")

# ---------------------------------------------------------------------------
# Remote text encoder for FLUX.2-dev
# ---------------------------------------------------------------------------
_text_encoder_client = None


def _get_text_encoder_client():
    global _text_encoder_client
    if _text_encoder_client is None:
        print("[FLUX] Connecting to remote text encoder Space...")
        _text_encoder_client = GradioClient("multimodalart/mistral-text-encoder")
        print("[FLUX] Remote text encoder connected.")
    return _text_encoder_client


def remote_text_encoder(prompt: str) -> torch.Tensor:
    """Encode prompt remotely and return CPU prompt_embeds."""
    client = _get_text_encoder_client()
    result = client.predict(prompt=prompt, api_name="/encode_text")
    try:
        prompt_embeds = torch.load(result[0], map_location="cpu", weights_only=True)
    except TypeError:
        # Backward compatibility for environments without weights_only
        prompt_embeds = torch.load(result[0], map_location="cpu")

    if isinstance(prompt_embeds, dict):
        prompt_embeds = prompt_embeds.get("prompt_embeds", list(prompt_embeds.values())[0])
    return prompt_embeds


# ===========================================================================
# Wan 2.2 I2V A14B — Module-level loading (ZeroGPU deferred)
#
# Loading at module level saves ~300s of GPU time per cold start.
# Text encoding (T5) and image encoding (CLIP) are done on CPU
# BEFORE calling @spaces.GPU, so ZeroGPU is only charged for
# transformer denoising and VAE decoding.
# ===========================================================================

print("[WAN] Loading Wan 2.2 I2V A14B...")
wan_pipe = WanImageToVideoPipeline.from_pretrained(
    "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
    torch_dtype=torch.bfloat16,
    cache_dir=HF_CACHE_DIR,
    token=HF_TOKEN,
)
wan_pipe.to("cuda")  # ZeroGPU intercepts — deferred
wan_pipe.enable_sequential_cpu_offload()  # Components stay on CPU, moved to GPU on-demand
print("[WAN] Wan 2.2 I2V A14B loaded.")


# ===========================================================================
# Image generation — FLUX.2-dev
# ===========================================================================

MAX_IMAGE_SIZE = 1024
MAX_SEED = np.iinfo(np.int32).max


def get_image_duration(prompt_embeds, image_list, width, height, num_inference_steps, guidance_scale, seed, progress=gr.Progress(track_tqdm=True)):
    """Dynamic GPU duration for FLUX.2-dev based on steps and image count."""
    num_images = 0 if image_list is None else len(image_list)
    step_duration = 1 + 0.8 * num_images
    return max(65, int(num_inference_steps) * step_duration + 10)


@spaces.GPU(duration=get_image_duration)
def generate_image(
    prompt_embeds,
    image_list=None,  # Optional: list of PIL images for I2I editing
    width=1024,
    height=1024,
    num_inference_steps=30,
    guidance_scale=4.0,
    seed=-1,
    progress=gr.Progress(track_tqdm=True),
):
    """Generate an image with FLUX.2-dev using precomputed prompt embeddings."""

    prompt_embeds = prompt_embeds.to("cuda")

    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cuda").manual_seed(seed)

    pipe_kwargs = {
        "prompt_embeds": prompt_embeds,
        "num_inference_steps": num_inference_steps,
        "guidance_scale": guidance_scale,
        "width": width,
        "height": height,
        "generator": generator,
    }

    # Add reference images for I2I editing if provided
    if image_list is not None and len(image_list) > 0:
        pipe_kwargs["image"] = image_list[0]

    result = flux_pipe(**pipe_kwargs)
    return result.images[0]


def infer_image(
    prompt,
    input_images=None,
    seed=-1,
    randomize_seed=False,
    width=1024,
    height=1024,
    num_inference_steps=30,
    guidance_scale=4.0,
    progress=gr.Progress(track_tqdm=True),
):
    """Orchestrate image generation with remote text encoding + GPU denoising."""
    if randomize_seed:
        seed = int(np.random.randint(0, MAX_SEED))

    # Clamp dimensions to max size and round to nearest multiple of 8
    width = max(256, min(MAX_IMAGE_SIZE, round(width / 8) * 8))
    height = max(256, min(MAX_IMAGE_SIZE, round(height / 8) * 8))

    # Step 1: Remote text encode (CPU/network bound)
    progress(0.08, desc="Encoding prompt...")
    prompt_embeds = remote_text_encoder(prompt)

    # Step 2: Prepare image list for I2I editing
    image_list = None
    if input_images is not None and len(input_images) > 0:
        image_list = []
        for item in input_images:
            # Gallery returns list of tuples (image, caption) or just images
            if isinstance(item, tuple):
                image_list.append(item[0])
            else:
                image_list.append(item)

    # Step 3: GPU inference
    progress(0.2, desc="Generating image...")
    image = generate_image(
        prompt_embeds=prompt_embeds,
        image_list=image_list,
        width=width,
        height=height,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
        seed=int(seed),
        progress=progress,
    )

    return image, int(seed)


# ---------------------------------------------------------------------------
# Video generation  (Wan 2.2 I2V A14B) — constants
# ---------------------------------------------------------------------------

MOD_VALUE = 16
MIN_FRAMES = 17
MAX_FRAMES = 81
FIXED_FPS = 16

DEFAULT_NEGATIVE_PROMPT = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，"
    "整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，"
    "画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，"
    "静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
)


def get_video_duration(image, prompt, negative_prompt, width, height, num_frames, guidance_scale, num_inference_steps, seed, progress=gr.Progress(track_tqdm=True)):
    """Dynamic GPU duration for Wan I2V based on frames and steps.
    Since text/image encoding is done on CPU, this only accounts for
    transformer denoising + VAE decode.
    """
    # Base: ~3s per step at 480p, scales with resolution and frames
    factor = (num_frames / 81) * (width * height) / (832 * 480)
    step_duration = max(3.0, 3.0 * factor)
    return max(60, int(num_inference_steps * step_duration) + 20)


@spaces.GPU(duration=get_video_duration)
def generate_video_gpu(
    prompt_embeds,         # Pre-computed on CPU
    negative_prompt_embeds,  # Pre-computed on CPU
    image_embeds,          # Pre-computed on CPU
    resized_image,         # PIL image (needed for VAE conditioning)
    height,
    width,
    num_frames,
    guidance_scale,
    num_inference_steps,
    seed,
    progress=gr.Progress(track_tqdm=True),
):
    """GPU-only video inference with pre-computed embeddings.
    Only transformer denoising + VAE decoding run on GPU.
    """
    # Move pre-computed embeddings to GPU
    prompt_embeds = prompt_embeds.to("cuda")
    negative_prompt_embeds = negative_prompt_embeds.to("cuda")
    image_embeds = image_embeds.to("cuda")

    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cuda").manual_seed(seed)

    output = wan_pipe(
        image=resized_image,
        prompt=None,    # Using pre-computed prompt_embeds
        negative_prompt=None,  # Using pre-computed negative_prompt_embeds
        prompt_embeds=prompt_embeds,
        negative_prompt_embeds=negative_prompt_embeds,
        image_embeds=image_embeds,
        height=height,
        width=width,
        num_frames=num_frames,
        guidance_scale=float(guidance_scale),
        num_inference_steps=int(num_inference_steps),
        generator=generator,
    )

    frames = output.frames[0]
    out_dir = os.path.join(DATA_DIR, "output") if HAS_PERSISTENT_STORAGE else "/tmp"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"wan_{os.getpid()}_{seed}.mp4")
    export_to_video(frames, out_path, fps=FIXED_FPS)
    return out_path


def infer_video(
    image,
    prompt,
    negative_prompt=DEFAULT_NEGATIVE_PROMPT,
    width=832,
    height=480,
    num_frames=81,
    guidance_scale=3.5,
    num_inference_steps=40,
    seed=-1,
    progress=gr.Progress(track_tqdm=True),
):
    """Orchestrate video generation: CPU text/image encoding → GPU inference.
    Text encoding (T5) and image encoding (CLIP) run on CPU — 0 GPU seconds.
    Only transformer denoising + VAE decode run on GPU.
    """
    if image is None:
        raise gr.Error("Please upload an input image.")

    # Resize image to valid dimensions
    target_w = max(MOD_VALUE, (width // MOD_VALUE) * MOD_VALUE)
    target_h = max(MOD_VALUE, (height // MOD_VALUE) * MOD_VALUE)
    num_frames = int(np.clip(num_frames, MIN_FRAMES, MAX_FRAMES))
    resized = image.convert("RGB").resize((target_w, target_h), Image.LANCZOS)

    neg_prompt = negative_prompt or DEFAULT_NEGATIVE_PROMPT

    # Step 1: Encode text on CPU (T5 text encoder) — 0 GPU seconds
    progress(0.05, desc="Encoding text...")
    prompt_embeds, negative_prompt_embeds = wan_pipe.encode_prompt(
        prompt=prompt,
        negative_prompt=neg_prompt,
        do_classifier_free_guidance=True,
        num_videos_per_prompt=1,
        device=torch.device("cpu"),  # Run on CPU — not charged to ZeroGPU
        dtype=torch.bfloat16,
    )

    # Step 2: Encode image on CPU (CLIP vision) — 0 GPU seconds
    progress(0.10, desc="Encoding image...")
    image_embeds = wan_pipe.encode_image(
        image=resized,
        device=torch.device("cpu"),  # Run on CPU — not charged to ZeroGPU
    )

    # Step 3: GPU inference only (transformer denoising + VAE decode)
    progress(0.15, desc="Generating video...")
    video_path = generate_video_gpu(
        prompt_embeds=prompt_embeds,
        negative_prompt_embeds=negative_prompt_embeds,
        image_embeds=image_embeds,
        resized_image=resized,
        height=target_h,
        width=target_w,
        num_frames=num_frames,
        guidance_scale=guidance_scale,
        num_inference_steps=num_inference_steps,
        seed=int(seed),
        progress=progress,
    )

    return video_path


# ---------------------------------------------------------------------------
# Gradio UI — also exposes API endpoints for programmatic access
# ---------------------------------------------------------------------------

with gr.Blocks(title="AI Studio – Image & Video") as demo:
    gr.Markdown("# AI Studio – FLUX.2-dev Image + Wan 2.2 Video Generation")

    # ── Image Generation Tab ────────────────────────────────────────────
    with gr.Tab("Image Generation"):
        with gr.Row():
            with gr.Column():
                img_prompt = gr.Textbox(label="Prompt", lines=3)
                with gr.Accordion("Input image(s) — optional editing", open=False):
                    img_input_images = gr.Gallery(
                        label="Reference Images (optional, for editing)",
                        type="pil",
                        columns=3,
                        rows=1,
                    )
                img_width = gr.Slider(256, 2048, value=1024, step=8, label="Width")
                img_height = gr.Slider(256, 2048, value=1024, step=8, label="Height")
                img_steps = gr.Slider(1, 50, value=30, step=1, label="Steps")
                img_guidance = gr.Slider(0.0, 10.0, value=4.0, step=0.5, label="Guidance Scale")
                img_seed = gr.Number(value=-1, label="Seed (-1 = random)", precision=0)
                img_randomize = gr.Checkbox(label="Randomize seed", value=True)
                img_btn = gr.Button("Generate Image", variant="primary")
            with gr.Column():
                img_output = gr.Image(label="Result", type="pil")

        img_btn.click(
            fn=infer_image,
            inputs=[
                img_prompt,
                img_input_images,
                img_seed,
                img_randomize,
                img_width,
                img_height,
                img_steps,
                img_guidance,
            ],
            outputs=[img_output, img_seed],
            api_name="infer",
        )

    # ── Video Generation Tab ────────────────────────────────────────────
    with gr.Tab("Video Generation (I2V)"):
        with gr.Row():
            with gr.Column():
                vid_image = gr.Image(label="Input Image", type="pil")
                vid_prompt = gr.Textbox(label="Prompt", lines=3)
                vid_neg = gr.Textbox(label="Negative Prompt", value=DEFAULT_NEGATIVE_PROMPT, lines=2)
                vid_width = gr.Slider(256, 1280, value=832, step=16, label="Width")
                vid_height = gr.Slider(256, 720, value=480, step=16, label="Height")
                vid_frames = gr.Slider(17, 81, value=81, step=4, label="Frames")
                vid_guidance = gr.Slider(0.0, 10.0, value=3.5, step=0.5, label="Guidance Scale")
                vid_steps = gr.Slider(1, 50, value=40, step=1, label="Steps")
                vid_seed = gr.Number(value=-1, label="Seed (-1 = random)", precision=0)
                vid_btn = gr.Button("Generate Video", variant="primary")
            with gr.Column():
                vid_output = gr.Video(label="Result")

        vid_btn.click(
            fn=infer_video,
            inputs=[
                vid_image,
                vid_prompt,
                vid_neg,
                vid_width,
                vid_height,
                vid_frames,
                vid_guidance,
                vid_steps,
                vid_seed,
            ],
            outputs=vid_output,
            api_name="generate_video",
        )

demo.launch()