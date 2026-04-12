import os
import spaces
import torch
import numpy as np
import gradio as gr
from PIL import Image
from diffusers import FluxPipeline, WanImageToVideoPipeline
from diffusers.utils import export_to_video

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

# ---------------------------------------------------------------------------
# Lazy-loaded pipelines (loaded on first request inside @spaces.GPU)
# Using sequential CPU offload for minimal VRAM usage on ZeroGPU H200 MIG
# ---------------------------------------------------------------------------
flux_pipe = None
wan_pipe = None


def _load_flux():
    global flux_pipe
    if flux_pipe is None:
        print("[FLUX] Loading FLUX.1-schnell...")
        flux_pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
            cache_dir=HF_CACHE_DIR,
            token=HF_TOKEN,
        )
        flux_pipe.enable_sequential_cpu_offload()
        print("[FLUX] Loaded.")
    return flux_pipe


def _load_wan():
    global wan_pipe
    if wan_pipe is None:
        print("[WAN] Loading Wan 2.2 I2V A14B...")
        wan_pipe = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
            torch_dtype=torch.bfloat16,
            cache_dir=HF_CACHE_DIR,
            token=HF_TOKEN,
        )
        wan_pipe.enable_sequential_cpu_offload()
        print("[WAN] Loaded.")
    return wan_pipe


# ---------------------------------------------------------------------------
# Image generation  (FLUX.1-schnell)
# ---------------------------------------------------------------------------

@spaces.GPU(duration=120)
def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    num_inference_steps: int = 4,
    guidance_scale: float = 0.0,
    seed: int = -1,
):
    """Generate an image with FLUX.1-schnell."""
    pipe = _load_flux()

    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cpu").manual_seed(seed)

    result = pipe(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
        generator=generator,
    )
    return result.images[0]


# ---------------------------------------------------------------------------
# Video generation  (Wan 2.2 I2V A14B)
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


@spaces.GPU(duration=300)
def generate_video(
    image: Image.Image,
    prompt: str,
    negative_prompt: str = DEFAULT_NEGATIVE_PROMPT,
    width: int = 832,
    height: int = 480,
    num_frames: int = 81,
    guidance_scale: float = 3.5,
    num_inference_steps: int = 40,
    seed: int = -1,
    progress=gr.Progress(track_tqdm=True),
):
    """Generate a video from an image + prompt with Wan 2.2 I2V."""
    pipe = _load_wan()

    target_w = max(MOD_VALUE, (width // MOD_VALUE) * MOD_VALUE)
    target_h = max(MOD_VALUE, (height // MOD_VALUE) * MOD_VALUE)
    num_frames = int(np.clip(num_frames, MIN_FRAMES, MAX_FRAMES))

    resized = image.convert("RGB").resize((target_w, target_h), Image.LANCZOS)

    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cpu").manual_seed(seed)

    output = pipe(
        image=resized,
        prompt=prompt,
        negative_prompt=negative_prompt or DEFAULT_NEGATIVE_PROMPT,
        height=target_h,
        width=target_w,
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


# ---------------------------------------------------------------------------
# Gradio UI  (also exposes /generate_image and /generate_video API endpoints)
# ---------------------------------------------------------------------------

with gr.Blocks(title="AI Studio – Image & Video") as demo:
    gr.Markdown("# AI Studio – FLUX Image + Wan 2.2 Video Generation")

    with gr.Tab("Image Generation"):
        with gr.Row():
            with gr.Column():
                img_prompt = gr.Textbox(label="Prompt", lines=3)
                img_width = gr.Slider(256, 2048, value=1024, step=64, label="Width")
                img_height = gr.Slider(256, 2048, value=1024, step=64, label="Height")
                img_steps = gr.Slider(1, 8, value=4, step=1, label="Steps")
                img_guidance = gr.Slider(0.0, 10.0, value=0.0, step=0.5, label="Guidance Scale")
                img_seed = gr.Number(value=-1, label="Seed (-1 = random)", precision=0)
                img_btn = gr.Button("Generate Image", variant="primary")
            with gr.Column():
                img_output = gr.Image(label="Result", type="pil")

        img_btn.click(
            fn=generate_image,
            inputs=[img_prompt, img_width, img_height, img_steps, img_guidance, img_seed],
            outputs=img_output,
            api_name="generate_image",
        )

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
            fn=generate_video,
            inputs=[vid_image, vid_prompt, vid_neg, vid_width, vid_height, vid_frames, vid_guidance, vid_steps, vid_seed],
            outputs=vid_output,
            api_name="generate_video",
        )

demo.launch()