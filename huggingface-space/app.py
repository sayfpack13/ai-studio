import os
import spaces
from dataclasses import dataclass
import json
import logging
import random
import re
import shutil
import sys
import warnings

# Set persistent cache env before importing diffusers/transformers so they pick up /data.
DEFAULT_DATA_DIR = "/data" if os.path.isdir("/data") else "/tmp"
SPACE_DATA_DIR = os.environ.get("SPACE_DATA_DIR", DEFAULT_DATA_DIR)
CACHE_ROOT = os.environ.get("CACHE_ROOT", os.path.join(SPACE_DATA_DIR, ".cache"))
HF_HOME = os.environ.get("HF_HOME", os.path.join(CACHE_ROOT, "huggingface"))
TORCH_HOME = os.environ.get("TORCH_HOME", os.path.join(CACHE_ROOT, "torch"))

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HOME", HF_HOME)
os.environ.setdefault("HF_HUB_CACHE", os.path.join(HF_HOME, "hub"))
os.environ.setdefault("TRANSFORMERS_CACHE", os.path.join(HF_HOME, "transformers"))
os.environ.setdefault("TORCH_HOME", TORCH_HOME)

from PIL import Image
from diffusers import AutoencoderKL, FlowMatchEulerDiscreteScheduler
import gradio as gr
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from prompt_check import is_unsafe_prompt

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from diffusers import ZImagePipeline
from diffusers.models.transformers.transformer_z_image import ZImageTransformer2DModel

from pe import prompt_template

# ==================== Environment Variables ================================== #
MODEL_PATH = os.environ.get("MODEL_PATH", "Tongyi-MAI/Z-Image-Turbo")
ENABLE_COMPILE = os.environ.get("ENABLE_COMPILE", "false").lower() == "true"
ENABLE_WARMUP = os.environ.get("ENABLE_WARMUP", "false").lower() == "true"
ATTENTION_BACKEND = os.environ.get("ATTENTION_BACKEND", "flash_3")
UNSAFE_MAX_NEW_TOKEN = int(os.environ.get("UNSAFE_MAX_NEW_TOKEN", "10"))
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY")
HF_TOKEN = os.environ.get("HF_TOKEN")
UNSAFE_PROMPT_CHECK = os.environ.get(
    "UNSAFE_PROMPT_CHECK",
    "You are a safety classifier. Reply only 'yes' if the user prompt requests unsafe, harmful, sexual, violent, illegal, or disallowed content. Reply only 'no' otherwise.",
)
# ============================================================================= #


for cache_path in [os.environ["HF_HOME"], os.environ["HF_HUB_CACHE"], os.environ["TRANSFORMERS_CACHE"], os.environ["TORCH_HOME"]]:
    try:
        os.makedirs(cache_path, exist_ok=True)
    except OSError as e:
        print(f"Warning: could not create cache path '{cache_path}': {e}")

warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)

RES_CHOICES = {
    "1024": [
        "1024x1024 ( 1:1 )",
        "1152x896 ( 9:7 )",
        "896x1152 ( 7:9 )",
        "1152x864 ( 4:3 )",
        "864x1152 ( 3:4 )",
        "1248x832 ( 3:2 )",
        "832x1248 ( 2:3 )",
        "1280x720 ( 16:9 )",
        "720x1280 ( 9:16 )",
        "1344x576 ( 21:9 )",
        "576x1344 ( 9:21 )",
    ],
    "1280": [
        "1280x1280 ( 1:1 )",
        "1440x1120 ( 9:7 )",
        "1120x1440 ( 7:9 )",
        "1472x1104 ( 4:3 )",
        "1104x1472 ( 3:4 )",
        "1536x1024 ( 3:2 )",
        "1024x1536 ( 2:3 )",
        "1536x864 ( 16:9 )",
        "864x1536 ( 9:16 )",
        "1680x720 ( 21:9 )",
        "720x1680 ( 9:21 )",
    ],
    "1536": [
        "1536x1536 ( 1:1 )",
        "1728x1344 ( 9:7 )",
        "1344x1728 ( 7:9 )",
        "1728x1296 ( 4:3 )",
        "1296x1728 ( 3:4 )",
        "1872x1248 ( 3:2 )",
        "1248x1872 ( 2:3 )",
        "2048x1152 ( 16:9 )",
        "1152x2048 ( 9:16 )",
        "2016x864 ( 21:9 )",
        "864x2016 ( 9:21 )",
    ],
}

RESOLUTION_SET = []
for resolutions in RES_CHOICES.values():
    RESOLUTION_SET.extend(resolutions)

EXAMPLE_PROMPTS = [
    ["一位男士和他的贵宾犬穿着配套的服装参加狗狗秀，室内灯光，背景中有观众。"],
    [
        "极具氛围感的暗调人像，一位优雅的中国美女在黑暗的房间里。一束强光通过遮光板，在她的脸上投射出一个清晰的闪电形状的光影，正好照亮一只眼睛。高对比度，明暗交界清晰，神秘感，莱卡相机色调。"
    ],
    [
        "Young Chinese woman in red Hanfu, intricate embroidery. Impeccable makeup, red floral forehead pattern. Elaborate high bun, golden phoenix headdress, red flowers, beads. Holds round folding fan with lady, trees, bird. Neon lightning-bolt lamp (⚡️), bright yellow glow, above extended left palm. Soft-lit outdoor night background, silhouetted tiered pagoda, blurred colorful distant lights."
    ],
]


def get_resolution(resolution):
    match = re.search(r"(\d+)\s*[×x]\s*(\d+)", resolution)
    if match:
        return int(match.group(1)), int(match.group(2))
    return 1024, 1024


def load_models(model_path, enable_compile=False, attention_backend="native"):
    print(f"Loading models from {model_path}...")

    # `token` expects a string or None. Passing True sends an invalid bearer token.
    auth_token = HF_TOKEN if HF_TOKEN else None

    resolved_model_path = model_path
    if not os.path.exists(model_path) and "/" in model_path:
        # Mirror snapshot to persistent bucket path so restarts reuse local files.
        from huggingface_hub import snapshot_download

        local_model_dir = os.path.join(SPACE_DATA_DIR, "models", model_path.replace("/", "--"))
        os.makedirs(local_model_dir, exist_ok=True)
        snapshot_download(
            repo_id=model_path,
            local_dir=local_model_dir,
            token=auth_token,
            resume_download=True,
        )
        resolved_model_path = local_model_dir
        print(f"Using local model snapshot: {resolved_model_path}")

    if not os.path.exists(resolved_model_path):
        print("Loading VAE from remote...")
        vae = AutoencoderKL.from_pretrained(
            f"{resolved_model_path}",
            subfolder="vae",
            cache_dir=os.environ["HF_HOME"],
            torch_dtype=torch.bfloat16,
            device_map="cuda",
            token=auth_token,
        )

        print("Loading Text Encoder from remote...")
        text_encoder = AutoModelForCausalLM.from_pretrained(
            f"{resolved_model_path}",
            subfolder="text_encoder",
            cache_dir=os.environ["HF_HOME"],
            torch_dtype=torch.bfloat16,
            device_map="cuda",
            token=auth_token,
        ).eval()

        print("Loading Tokenizer from remote...")
        tokenizer = AutoTokenizer.from_pretrained(
            f"{resolved_model_path}", subfolder="tokenizer", cache_dir=os.environ["HF_HOME"], token=auth_token
        )
    else:
        print("Loading VAE from local...")
        vae = AutoencoderKL.from_pretrained(
            os.path.join(resolved_model_path, "vae"), torch_dtype=torch.bfloat16, device_map="cuda"
        )

        print("Loading Text Encoder from local...")
        text_encoder = AutoModelForCausalLM.from_pretrained(
            os.path.join(resolved_model_path, "text_encoder"),
            torch_dtype=torch.bfloat16,
            device_map="cuda",
        ).eval()

        print("Loading Tokenizer from local...")
        tokenizer = AutoTokenizer.from_pretrained(os.path.join(resolved_model_path, "tokenizer"))

    print("Padding tokenizer...")
    tokenizer.padding_side = "left"

    if enable_compile:
        print("Enabling torch.compile optimizations...")
        torch._inductor.config.conv_1x1_as_mm = True
        torch._inductor.config.coordinate_descent_tuning = True
        torch._inductor.config.epilogue_fusion = False
        torch._inductor.config.coordinate_descent_check_all_directions = True
        torch._inductor.config.max_autotune_gemm = True
        torch._inductor.config.max_autotune_gemm_backends = "TRITON,ATEN"
        torch._inductor.config.triton.cudagraphs = False

    print("Initializing ZImagePipeline...")
    pipe = ZImagePipeline(scheduler=None, vae=vae, text_encoder=text_encoder, tokenizer=tokenizer, transformer=None)

    if enable_compile:
        pipe.vae.disable_tiling()

    print("Loading Transformer...")
    if not os.path.exists(resolved_model_path):
        transformer = ZImageTransformer2DModel.from_pretrained(
            f"{resolved_model_path}", subfolder="transformer", cache_dir=os.environ["HF_HOME"], token=auth_token, torch_dtype=torch.bfloat16
        ).to("cuda")
    else:
        transformer = ZImageTransformer2DModel.from_pretrained(os.path.join(resolved_model_path, "transformer"), torch_dtype=torch.bfloat16).to(
            "cuda"
        )
    print("Transformer loaded.")

    pipe.transformer = transformer

    # Try the configured attention backend; fall back to "native" if unavailable
    effective_backend = attention_backend
    try:
        print(f"Setting attention backend: {attention_backend}")
        pipe.transformer.set_attention_backend(attention_backend)
        print(f"Attention backend set to: {attention_backend}")
    except (ValueError, RuntimeError) as e:
        print(f"Attention backend '{attention_backend}' not available ({e}), falling back to 'native'")
        effective_backend = "native"
        pipe.transformer.set_attention_backend("native")

    if enable_compile:
        print("Compiling transformer...")
        pipe.transformer = torch.compile(pipe.transformer, mode="max-autotune-no-cudagraphs", fullgraph=False)

    print("Moving pipeline to cuda...")
    pipe.to("cuda", torch.bfloat16)

    print("Loading Safety Checker...")
    from diffusers.pipelines.stable_diffusion import StableDiffusionSafetyChecker
    from transformers import CLIPImageProcessor

    safety_model_id = "CompVis/stable-diffusion-safety-checker"
    safety_feature_extractor = CLIPImageProcessor.from_pretrained(safety_model_id, cache_dir=os.environ["HF_HOME"])
    safety_checker = StableDiffusionSafetyChecker.from_pretrained(
        safety_model_id, cache_dir=os.environ["HF_HOME"], torch_dtype=torch.float16
    ).to("cuda")

    pipe.safety_feature_extractor = safety_feature_extractor
    pipe.safety_checker = safety_checker
    print("Done loading models.")
    return pipe, effective_backend


def _is_corrupt_safetensors_error(err):
    msg = str(err).lower()
    markers = [
        "incomplete metadata",
        "file not fully covered",
        "error while deserializing header",
    ]
    return any(marker in msg for marker in markers)


def _clear_remote_model_cache(model_path):
    # Remove Hub cache and persistent mirrored snapshot for this model ID.
    if "/" not in model_path:
        return False

    namespace, repo = model_path.split("/", 1)
    cache_repo_dir = f"models--{namespace}--{repo}"

    candidates = [
        os.path.join(os.environ.get("HF_HUB_CACHE", ""), cache_repo_dir),
        os.path.join(os.environ.get("HF_HOME", ""), "hub", cache_repo_dir),
        os.path.join(SPACE_DATA_DIR, "models", model_path.replace("/", "--")),
    ]

    removed = False
    for candidate in candidates:
        if candidate and os.path.isdir(candidate):
            try:
                shutil.rmtree(candidate)
                print(f"Removed corrupted model cache: {candidate}")
                removed = True
            except OSError as e:
                print(f"Warning: failed to remove cache '{candidate}': {e}")
    return removed


def generate_image(
    pipe,
    prompt,
    resolution="1024x1024",
    seed=42,
    guidance_scale=5.0,
    num_inference_steps=50,
    shift=3.0,
    max_sequence_length=512,
    progress=gr.Progress(track_tqdm=True),
):
    width, height = get_resolution(resolution)

    generator = torch.Generator("cuda").manual_seed(seed)

    scheduler = FlowMatchEulerDiscreteScheduler(num_train_timesteps=1000, shift=shift)
    pipe.scheduler = scheduler

    image = pipe(
        prompt=prompt,
        height=height,
        width=width,
        guidance_scale=guidance_scale,
        num_inference_steps=num_inference_steps,
        generator=generator,
        max_sequence_length=max_sequence_length,
    ).images[0]

    return image


def warmup_model(pipe, resolutions):
    # On ZeroGPU Spaces, CUDA is only available inside @spaces.GPU functions.
    # Skip warmup if no CUDA device is available at module level.
    if not torch.cuda.is_available():
        print("CUDA not available at module level (ZeroGPU) — skipping warmup.")
        return

    print("Starting warmup phase...")

    dummy_prompt = "warmup"

    for res_str in resolutions:
        print(f"Warming up for resolution: {res_str}")
        try:
            for i in range(3):
                generate_image(
                    pipe,
                    prompt=dummy_prompt,
                    resolution=res_str,
                    num_inference_steps=9,
                    guidance_scale=0.0,
                    seed=42 + i,
                )
        except Exception as e:
            print(f"Warmup failed for {res_str}: {e}")
            break  # Stop warmup after first CUDA error to avoid spam

    print("Warmup completed.")


# ==================== Prompt Expander ==================== #
@dataclass
class PromptOutput:
    status: bool
    prompt: str
    seed: int
    system_prompt: str
    message: str


class PromptExpander:
    def __init__(self, backend="api", **kwargs):
        self.backend = backend

    def decide_system_prompt(self, template_name=None):
        return prompt_template


class APIPromptExpander(PromptExpander):
    def __init__(self, api_config=None, **kwargs):
        super().__init__(backend="api", **kwargs)
        self.api_config = api_config or {}
        self.client = self._init_api_client()

    def _init_api_client(self):
        try:
            from openai import OpenAI

            api_key = self.api_config.get("api_key") or DASHSCOPE_API_KEY
            base_url = self.api_config.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")

            if not api_key:
                print("Warning: DASHSCOPE_API_KEY not found.")
                return None

            return OpenAI(api_key=api_key, base_url=base_url)
        except ImportError:
            print("Please install openai: pip install openai")
            return None
        except Exception as e:
            print(f"Failed to initialize API client: {e}")
            return None

    def __call__(self, prompt, system_prompt=None, seed=-1, **kwargs):
        return self.extend(prompt, system_prompt, seed, **kwargs)

    def extend(self, prompt, system_prompt=None, seed=-1, **kwargs):
        if self.client is None:
            return PromptOutput(False, "", seed, system_prompt, "API client not initialized")

        if system_prompt is None:
            system_prompt = self.decide_system_prompt()

        if "{prompt}" in system_prompt:
            system_prompt = system_prompt.format(prompt=prompt)
            prompt = " "

        try:
            model = self.api_config.get("model", "qwen3-max-preview")
            response = self.client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}],
                temperature=0.7,
                top_p=0.8,
            )

            content = response.choices[0].message.content
            json_start = content.find("```json")
            if json_start != -1:
                json_end = content.find("```", json_start + 7)
                try:
                    json_str = content[json_start + 7 : json_end].strip()
                    data = json.loads(json_str)
                    expanded_prompt = data.get("revised_prompt", content)
                except:
                    expanded_prompt = content
            else:
                expanded_prompt = content

            return PromptOutput(
                status=True, prompt=expanded_prompt, seed=seed, system_prompt=system_prompt, message=content
            )
        except Exception as e:
            return PromptOutput(False, "", seed, system_prompt, str(e))


def create_prompt_expander(backend="api", **kwargs):
    if backend == "api":
        return APIPromptExpander(**kwargs)
    raise ValueError("Only 'api' backend is supported.")


pipe = None
prompt_expander = None
effective_backend = None


def init_app():
    global pipe, prompt_expander, effective_backend

    try:
        pipe, effective_backend = load_models(MODEL_PATH, enable_compile=ENABLE_COMPILE, attention_backend=ATTENTION_BACKEND)
        print(f"Model loaded. Compile: {ENABLE_COMPILE}, Backend: {effective_backend}")

        if ENABLE_WARMUP:
            all_resolutions = []
            for cat in RES_CHOICES.values():
                all_resolutions.extend(cat)
            warmup_model(pipe, all_resolutions)

    except Exception as e:
        if _is_corrupt_safetensors_error(e):
            print(f"Detected corrupted model cache during load: {e}")
            cleared = _clear_remote_model_cache(MODEL_PATH)
            if cleared:
                try:
                    print("Retrying model load after cache cleanup...")
                    pipe, effective_backend = load_models(
                        MODEL_PATH, enable_compile=ENABLE_COMPILE, attention_backend=ATTENTION_BACKEND
                    )
                    print(f"Model loaded on retry. Compile: {ENABLE_COMPILE}, Backend: {effective_backend}")
                except Exception as retry_err:
                    print(f"Retry failed after cache cleanup: {retry_err}")
                    pipe = None
            else:
                print("Corrupted safetensors detected, but no removable remote cache directory was found.")
                pipe = None
        else:
            print(f"Error loading model: {e}")
            pipe = None

    try:
        prompt_expander = create_prompt_expander(backend="api", api_config={"model": "qwen3-max-preview"})
        print("Prompt expander initialized.")
    except Exception as e:
        print(f"Error initializing prompt expander: {e}")
        prompt_expander = None


def prompt_enhance(prompt, enable_enhance):
    if not enable_enhance or not prompt_expander:
        return prompt, "Enhancement disabled or not available."

    if not prompt.strip():
        return "", "Please enter a prompt."

    try:
        result = prompt_expander(prompt)
        if result.status:
            return result.prompt, result.message
        else:
            return prompt, f"Enhancement failed: {result.message}"
    except Exception as e:
        return prompt, f"Error: {str(e)}"


@spaces.GPU
def generate(
    prompt,
    resolution="1024x1024 ( 1:1 )",
    seed=42,
    steps=9,
    shift=3.0,
    random_seed=True,
    gallery_images=None,
    enhance=False,
    progress=gr.Progress(track_tqdm=True),
):
    if random_seed:
        new_seed = random.randint(1, 1000000)
    else:
        new_seed = seed if seed != -1 else random.randint(1, 1000000)

    class UnsafeContentError(Exception):
        pass

    try:
        if pipe is None:
            raise gr.Error("Model not loaded.")

        has_unsafe_concept = is_unsafe_prompt(
            pipe.text_encoder,
            pipe.tokenizer,
            system_prompt=UNSAFE_PROMPT_CHECK,
            user_prompt=prompt,
            max_new_token=UNSAFE_MAX_NEW_TOKEN,
        )
        if has_unsafe_concept:
            raise UnsafeContentError("Input unsafe")

        final_prompt = prompt

        if enhance:
            final_prompt, _ = prompt_enhance(prompt, True)
            print(f"Enhanced prompt: {final_prompt}")

        try:
            resolution_str = resolution.split(" ")[0]
        except:
            resolution_str = "1024x1024"

        image = generate_image(
            pipe=pipe,
            prompt=final_prompt,
            resolution=resolution_str,
            seed=new_seed,
            guidance_scale=0.0,
            num_inference_steps=int(steps + 1),
            shift=shift,
        )

        safety_checker_input = pipe.safety_feature_extractor([image], return_tensors="pt").pixel_values.cuda()
        _, has_nsfw_concept = pipe.safety_checker(images=[torch.zeros(1)], clip_input=safety_checker_input)
        has_nsfw_concept = has_nsfw_concept[0]
        if has_nsfw_concept:
            raise UnsafeContentError("input unsafe")

    except UnsafeContentError:
        image = Image.open("nsfw.png")

    if gallery_images is None:
        gallery_images = []
    gallery_images = [image] + gallery_images

    return gallery_images, str(new_seed), int(new_seed)


init_app()

# ==================== AoTI (Ahead of Time Inductor compilation) ==================== #
# Only load FA3 AoTI blocks when the flash_3/_flash_3 backend is actually available
if pipe is not None and effective_backend in ("flash_3", "_flash_3"):
    try:
        pipe.transformer.layers._repeated_blocks = ["ZImageTransformerBlock"]
        spaces.aoti_blocks_load(pipe.transformer.layers, "zerogpu-aoti/Z-Image", variant="fa3")
    except Exception as e:
        print(f"AoTI blocks load skipped: {e}")

with gr.Blocks(title="Z-Image Demo") as demo:
    gr.Markdown(
        """<div align="center">

# Z-Image Generation Demo

[![GitHub](https://img.shields.io/badge/GitHub-Z--Image-181717?logo=github&logoColor=white)](https://github.com/Tongyi-MAI/Z-Image)

*An Efficient Image Generation Foundation Model with Single-Stream Diffusion Transformer*

</div>"""
    )

    with gr.Row():
        with gr.Column(scale=1):
            prompt_input = gr.Textbox(label="Prompt", lines=3, placeholder="Enter your prompt here...")

            with gr.Row():
                choices = [int(k) for k in RES_CHOICES.keys()]
                res_cat = gr.Dropdown(value=1024, choices=choices, label="Resolution Category")

                initial_res_choices = RES_CHOICES["1024"]
                resolution = gr.Dropdown(
                    value=initial_res_choices[0], choices=RESOLUTION_SET, label="Width x Height (Ratio)"
                )

            with gr.Row():
                seed = gr.Number(label="Seed", value=42, precision=0)
                random_seed = gr.Checkbox(label="Random Seed", value=True)

            with gr.Row():
                steps = gr.Slider(label="Steps", minimum=1, maximum=100, value=8, step=1, interactive=False)
                shift = gr.Slider(label="Time Shift", minimum=1.0, maximum=10.0, value=3.0, step=0.1)

            generate_btn = gr.Button("Generate", variant="primary")

            gr.Markdown("### 📝 Example Prompts")
            gr.Examples(examples=EXAMPLE_PROMPTS, inputs=prompt_input, label=None)

        with gr.Column(scale=1):
            output_gallery = gr.Gallery(
                label="Generated Images",
                columns=2,
                rows=2,
                height=600,
                object_fit="contain",
                format="png",
                interactive=False,
            )
            used_seed = gr.Textbox(label="Seed Used", interactive=False)

    def update_res_choices(_res_cat):
        if str(_res_cat) in RES_CHOICES:
            res_choices = RES_CHOICES[str(_res_cat)]
        else:
            res_choices = RES_CHOICES["1024"]
        return gr.update(value=res_choices[0], choices=res_choices)

    res_cat.change(update_res_choices, inputs=res_cat, outputs=resolution, api_visibility="private")

    generate_btn.click(
        generate,
        inputs=[prompt_input, resolution, seed, steps, shift, random_seed, output_gallery],
        outputs=[output_gallery, used_seed, seed],
        api_visibility="public",
    )

    css = """
    .fillable{max-width: 1230px !important}
    """
    if __name__ == "__main__":
        demo.launch(css=css)