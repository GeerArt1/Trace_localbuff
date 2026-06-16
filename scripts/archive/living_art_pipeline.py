#!/usr/bin/env python3.10
"""
Living Art Pipeline
===================
Creates documentary-style "living art" videos from static artwork images.

Features:
- Ken Burns cinematic effects (zoom, pan) on artwork (free, local)
- AI video generation via FAL.ai (Wan 2.1 or Hailuo/MiniMax)
- Voiceover narration using Piper TTS (local, free)
- Background ambient audio (optional)
- Final composition as MP4

Usage:
    python3.10 living_art_pipeline.py --image artwork.jpg --text "Narration script" --output output.mp4
    python3.10 living_art_pipeline.py --image artwork.jpg --text-file script.txt --voice en_US-amy-medium
    python3.10 living_art_pipeline.py --image artwork.jpg --text "Description..." --video-method wan
    python3.10 living_art_pipeline.py --image artwork.jpg --text "Description..." --video-method hailuo

Requirements:
    - Python 3.10 with piper-tts, fal-client, requests
    - FFmpeg
    - Piper TTS voice models in the configured models directory
    - FAL_KEY environment variable (for --video-method wan/hailuo)
"""

import argparse
import base64
import json
import os
import subprocess
import tempfile
import wave
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MODELS_DIR = os.path.expanduser(
    "~/Documents/P A U L   H I L S E/voice-studio/models"
)
DEFAULT_VOICE = "en_US-lessac-high"
DEFAULT_FPS = 24
DEFAULT_RESOLUTION = "1920x1080"

# ---------------------------------------------------------------------------
# AI Video Model Registry
# ---------------------------------------------------------------------------

AI_MODELS = {
    # Wan 2.1 models
    "wan": {
        "slug": "fal-ai/wan-i2v",
        "label": "Wan 2.1 (FAL.ai)",
        "cost": 0.25,
        "max_frames": 121,
        "supports_motion_strength": True,
    },
    "wan-t2v": {
        "slug": "fal-ai/wan-t2v",
        "label": "Wan 2.1 T2V (FAL.ai)",
        "cost": 0.25,
        "max_frames": 121,
        "supports_motion_strength": False,
    },
    # Hailuo / MiniMax models
    "hailuo": {
        "slug": "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
        "label": "Hailuo 2.3 Pro (FAL.ai)",
        "cost": 0.49,
        "max_frames": 81,
        "supports_motion_strength": False,
    },
    "hailuo-fast": {
        "slug": "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video",
        "label": "Hailuo 2.3 Fast (FAL.ai)",
        "cost": 0.25,
        "max_frames": 81,
        "supports_motion_strength": False,
    },
    "hailuo-02": {
        "slug": "fal-ai/minimax/hailuo-02/standard/image-to-video",
        "label": "Hailuo 02 (FAL.ai)",
        "cost": 0.30,
        "max_frames": 81,
        "supports_motion_strength": False,
    },
}

DEFAULT_FAL_MODEL = "wan"  # Key into AI_MODELS registry


# ---------------------------------------------------------------------------
# Piper TTS
# ---------------------------------------------------------------------------


def find_model_files(voice_name: str, models_dir: str) -> tuple[str, str]:
    """Find the .onnx and .json model files for a given voice name."""
    onnx_path = os.path.join(models_dir, f"{voice_name}.onnx")
    json_path = onnx_path + ".json"

    if not os.path.exists(onnx_path):
        raise FileNotFoundError(f"Model file not found: {onnx_path}")
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Config file not found: {json_path}")

    return onnx_path, json_path


def generate_voiceover(text: str, voice_name: str, models_dir: str, output_wav: str) -> float:
    """
    Generate voiceover audio using Piper TTS.
    Returns the duration of the generated audio in seconds.
    """
    print(f"[TTS] Loading voice: {voice_name}")

    from piper import PiperVoice

    onnx_path, json_path = find_model_files(voice_name, models_dir)
    print(f"[TTS] Model: {onnx_path}")

    voice = PiperVoice.load(onnx_path, config_path=json_path)
    print(f"[TTS] Voice loaded (sample_rate={voice.config.sample_rate})")

    with wave.open(output_wav, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)

    with wave.open(output_wav, "rb") as wav_file:
        frames = wav_file.getnframes()
        rate = wav_file.getframerate()
        duration = frames / float(rate)

    print(f"[TTS] Generated {duration:.1f}s audio -> {output_wav}")
    return duration


# ---------------------------------------------------------------------------
# AI Video Generation via FAL.ai
# ---------------------------------------------------------------------------


def generate_ai_video(
    image_path: str,
    output_video: str,
    duration: float,
    prompt: str = "",
    model_key: str = DEFAULT_FAL_MODEL,
    motion_strength: int = 127,
) -> str:
    """
    Generate an AI-animated video from a static image using FAL.ai.
    Supports Wan 2.1 and Hailuo/MiniMax models.
    The API requires a URL, so we encode local files as base64 data URIs.
    """
    import requests
    import fal_client

    fal_key = os.environ.get("FAL_KEY")
    if not fal_key:
        raise RuntimeError(
            "FAL_KEY environment variable not set. "
            "Get your key at https://fal.ai/dashboard/keys "
            "then: export FAL_KEY=your_key_here"
        )

    # Resolve model from registry
    if model_key not in AI_MODELS:
        available = ", ".join(AI_MODELS.keys())
        raise ValueError(f"Unknown model '{model_key}'. Available: {available}")
    model_info = AI_MODELS[model_key]
    model_slug = model_info["slug"]

    with open(image_path, "rb") as f:
        image_data = f.read()
    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    mime = mime_map.get(ext, "image/jpeg")
    image_data_uri = f"data:{mime};base64,{base64.b64encode(image_data).decode()}"

    if not prompt:
        prompt = "Gentle cinematic camera movement, subtle parallax depth, slow and natural motion"

    num_frames = min(int(duration * 24), model_info["max_frames"])

    print(f"[AI Video] Model: {model_info['label']}")
    print(f"[AI Video] Slug:  {model_slug}")
    print(f"[AI Video] Prompt: {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
    print(f"[AI Video] Frames: {num_frames} | Cost: ~${model_info['cost']:.2f}")
    print(f"[AI Video] Generating... (this may take 30-120 seconds)")

    # Build arguments based on model capabilities
    arguments = {
        "image_url": image_data_uri,
        "prompt": prompt,
        "num_frames": num_frames,
    }
    if model_info["supports_motion_strength"]:
        arguments["guidance_scale"] = 5.0
        arguments["motion_strength"] = motion_strength

    result = fal_client.subscribe(
        model_slug,
        arguments=arguments,
        with_logs=True,
    )

    video_url = result["video"]["url"]
    print(f"[AI Video] Downloading from: {video_url[:80]}...")
    response = requests.get(video_url)
    response.raise_for_status()

    with open(output_video, "wb") as f:
        f.write(response.content)

    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        output_video,
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
    gen_duration = float(probe_result.stdout.strip()) if probe_result.stdout.strip() else 0

    print(f"[AI Video] Generated {gen_duration:.1f}s video -> {output_video}")
    return output_video


def loop_video_to_duration(
    video_path: str, output_path: str, target_duration: float, fps: int = DEFAULT_FPS
) -> str:
    """Loop/extend a short AI-generated video to match the target duration using FFmpeg."""
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
    current_duration = float(probe_result.stdout.strip()) if probe_result.stdout.strip() else 5.0

    if current_duration >= target_duration:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-t", str(target_duration),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p",
            output_path,
        ]
    else:
        loops_needed = int(target_duration / current_duration) + 1
        fade_out_start = max(target_duration - 2, 0.5)
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", str(loops_needed),
            "-i", video_path,
            "-t", str(target_duration),
            "-vf", f"fade=t=in:st=0:d=1.5,fade=t=out:st={fade_out_start}:d=2",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p",
            output_path,
        ]

    print(f"[AI Video] Extending to {target_duration:.1f}s (loop + trim)")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[AI Video] FFmpeg error:\n{result.stderr}")
        raise RuntimeError("Failed to extend video duration")

    print(f"[AI Video] Extended video: {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Ken Burns Effects via FFmpeg
# ---------------------------------------------------------------------------


def get_image_dimensions(image_path: str) -> tuple[int, int]:
    """Get image width and height using FFprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json",
        image_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        stream = info["streams"][0]
        return int(stream["width"]), int(stream["height"])
    except (subprocess.CalledProcessError, KeyError, IndexError) as e:
        raise RuntimeError(
            f"Failed to read image dimensions from '{image_path}'. "
            f"Ensure it is a valid image file. Error: {e}"
        ) from e


def create_ken_burns_video(
    image_path: str,
    output_video: str,
    duration: float,
    fps: int = DEFAULT_FPS,
    resolution: str = DEFAULT_RESOLUTION,
    effect: str = "zoom_in",
) -> str:
    """
    Create a Ken Burns effect video from a static image using FFmpeg.
    """
    w, h = resolution.split("x")
    w, h = int(w), int(h)
    total_frames = int(duration * fps)

    img_w, img_h = get_image_dimensions(image_path)
    print(f"[Video] Image: {img_w}x{img_h}, Output: {w}x{h}, Duration: {duration:.1f}s")

    if effect == "zoom_in":
        zoom_expr = f"min(1+0.3*on/{total_frames},1.3)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif effect == "zoom_out":
        zoom_expr = f"max(1.3-0.3*on/{total_frames},1.0)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif effect == "pan_left":
        zoom_expr = "1.15"
        x_expr = f"(iw-iw/zoom)*(1-on/{total_frames})"
        y_expr = "ih/2-(ih/zoom/2)"
    elif effect == "pan_right":
        zoom_expr = "1.15"
        x_expr = f"(iw-iw/zoom)*(on/{total_frames})"
        y_expr = "ih/2-(ih/zoom/2)"
    elif effect == "pan_up":
        zoom_expr = "1.15"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = f"(ih-ih/zoom)*(1-on/{total_frames})"
    elif effect == "pan_down":
        zoom_expr = "1.15"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = f"(ih-ih/zoom)*(on/{total_frames})"
    elif effect == "drift":
        zoom_expr = f"min(1+0.15*on/{total_frames},1.15)"
        x_expr = f"(iw-iw/zoom)*(on/{total_frames})*0.7"
        y_expr = f"(ih-ih/zoom)*(on/{total_frames})*0.3"
    else:
        zoom_expr = f"min(1+0.3*on/{total_frames},1.3)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"

    zoompan = (
        f"zoompan=z='{zoom_expr}'"
        f":x='{x_expr}'"
        f":y='{y_expr}'"
        f":d={total_frames}"
        f":s={w}x{h}"
        f":fps={fps}"
    )

    fade_in = "fade=t=in:st=0:d=1.5"
    filters = f"{zoompan},{fade_in}"
    if duration > 4:
        fade_out = f"fade=t=out:st={duration - 2}:d=2"
        filters += f",{fade_out}"

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", image_path,
        "-vf", filters,
        "-t", str(duration),
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        output_video,
    ]

    print(f"[Video] Creating Ken Burns '{effect}' effect...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[Video] FFmpeg error:\n{result.stderr}")
        raise RuntimeError("FFmpeg video creation failed")

    print(f"[Video] Created: {output_video}")
    return output_video


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------


def combine_video_audio(
    video_path: str,
    audio_path: str,
    output_path: str,
    extra_audio_path: Optional[str] = None,
    audio_volume: float = 1.0,
    extra_volume: float = 0.15,
) -> str:
    """Combine video and audio into final MP4."""
    extra_volume = max(0.0, min(1.0, extra_volume))
    cmd = ["ffmpeg", "-y", "-i", video_path, "-i", audio_path]

    if extra_audio_path:
        cmd.extend(["-i", extra_audio_path])
        filter_complex = (
            f"[1:a]volume={audio_volume}[voice];"
            f"[2:a]volume={extra_volume}[bg];"
            f"[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"
        )
        cmd.extend([
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
        ])
    else:
        cmd.extend([
            "-map", "0:v",
            "-map", "1:a",
        ])

    cmd.extend([
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_path,
    ])

    print(f"[Compose] Combining video + audio -> {output_path}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[Compose] FFmpeg error:\n{result.stderr}")
        raise RuntimeError("FFmpeg composition failed")

    print(f"[Compose] Final video: {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------


def run_pipeline(
    image_path: str,
    narration_text: str,
    output_path: str,
    voice_name: str = DEFAULT_VOICE,
    models_dir: str = DEFAULT_MODELS_DIR,
    video_method: str = "ken_burns",
    effect: str = "zoom_in",
    resolution: str = DEFAULT_RESOLUTION,
    fps: int = DEFAULT_FPS,
    background_audio: Optional[str] = None,
    background_volume: float = 0.15,
    padding: float = 3.0,
    ai_prompt: str = "",
    motion_strength: int = 127,
) -> str:
    """
    Run the complete living art pipeline:
    1. Generate voiceover with Piper TTS
    2. Create video from artwork (Ken Burns or AI)
    3. Combine into final MP4
    """
    is_ai = video_method in AI_MODELS
    if is_ai:
        model_info = AI_MODELS[video_method]
        method_label = model_info["label"]
        cost_str = f"~${model_info['cost']:.2f}/video"
    else:
        method_label = f"Ken Burns ({effect})"
        cost_str = None

    print("=" * 60)
    print("  Living Art Pipeline")
    print("=" * 60)
    print(f"  Image:       {image_path}")
    print(f"  Voice:       {voice_name}")
    print(f"  Video:       {method_label}")
    print(f"  Resolution:  {resolution}")
    print(f"  Output:      {output_path}")
    if cost_str:
        print(f"  Est. cost:   {cost_str}")
    print("=" * 60)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    if background_audio and not os.path.exists(background_audio):
        raise FileNotFoundError(f"Background audio not found: {background_audio}")

    if is_ai and not os.environ.get("FAL_KEY"):
        raise RuntimeError(
            "FAL_KEY environment variable not set for AI video generation.\n"
            "Get your key at https://fal.ai/dashboard/keys\n"
            "Then: export FAL_KEY=your_key_here"
        )

    for cmd_name in ["ffmpeg", "ffprobe"]:
        if subprocess.run(["which", cmd_name], capture_output=True).returncode != 0:
            raise RuntimeError(
                f"{cmd_name} is required but not found. Install with: brew install ffmpeg"
            )

    with tempfile.TemporaryDirectory(prefix="living_art_") as tmp_dir:
        voiceover_wav = os.path.join(tmp_dir, "voiceover.wav")
        final_video = os.path.join(tmp_dir, "video.mp4")

        print("\n--- Step 1: Generating Voiceover ---")
        audio_duration = generate_voiceover(
            narration_text, voice_name, models_dir, voiceover_wav
        )

        total_duration = audio_duration + padding

        if is_ai:
            print(f"\n--- Step 2: AI Video Generation ({AI_MODELS[video_method]['label']}) ---")
            raw_ai_video = os.path.join(tmp_dir, "ai_raw.mp4")
            generate_ai_video(
                image_path, raw_ai_video,
                duration=total_duration,
                prompt=ai_prompt,
                model_key=video_method,
                motion_strength=motion_strength,
            )
            loop_video_to_duration(raw_ai_video, final_video, total_duration, fps)
        else:
            print("\n--- Step 2: Creating Ken Burns Video ---")
            create_ken_burns_video(
                image_path, final_video,
                duration=total_duration,
                fps=fps, resolution=resolution,
                effect=effect,
            )

        print("\n--- Step 3: Combining Video + Audio ---")
        combine_video_audio(
            final_video, voiceover_wav, output_path,
            extra_audio_path=background_audio,
            extra_volume=background_volume,
        )

    print("\n" + "=" * 60)
    print(f"  Done! Output: {output_path}")
    print("=" * 60)

    return output_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def list_ai_models():
    """Print available AI video models with details."""
    print("Available AI video models:\n")
    print(f"  {'Key':<15} {'Model':<45} {'Cost':<10}")
    print("  " + "-" * 70)
    for key, info in AI_MODELS.items():
        print(f"  {key:<15} {info['label']:<45} ~${info['cost']:.2f}")
    print(f"\n  All models require FAL_KEY environment variable.")
    print(f"  Get yours at: https://fal.ai/dashboard/keys")


def main():
    ai_method_choices = ["ken_burns"] + list(AI_MODELS.keys())

    parser = argparse.ArgumentParser(
        description="Living Art Pipeline - Ken Burns / AI Video + Piper TTS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Video methods:
  ken_burns       Ken Burns cinematic effects (free, local)
  wan             Wan 2.1 image-to-video (~$0.25/video, requires FAL_KEY)
  wan-t2v         Wan 2.1 text-to-video (~$0.25/video, requires FAL_KEY)
  hailuo          Hailuo 2.3 Pro image-to-video (~$0.49/video, requires FAL_KEY)
  hailuo-fast     Hailuo 2.3 Fast image-to-video (~$0.25/video, requires FAL_KEY)
  hailuo-02       Hailuo 02 image-to-video (~$0.30/video, requires FAL_KEY)

Ken Burns effects: zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down, drift

Examples:
  # Ken Burns (free, default)
  %(prog)s --image artwork.jpg --text "This painting was created in 1888..."

  # Wan 2.1 (~$0.25)
  %(prog)s --image artwork.jpg --text "Description..." --video-method wan

  # Hailuo 2.3 Pro (~$0.49)
  %(prog)s --image painting.jpg --text "..." --video-method hailuo

  # Hailuo 2.3 Fast (~$0.25, same price as Wan)
  %(prog)s --image painting.jpg --text "..." --video-method hailuo-fast

  # List all available AI models
  %(prog)s --list-models
        """,
    )

    parser.add_argument("--image", "-i", help="Path to artwork image")
    parser.add_argument("--text", "-t", help="Narration text (inline)")
    parser.add_argument("--text-file", "-f", help="Path to text file with narration")
    parser.add_argument("--output", "-o", default="living_art_output.mp4", help="Output MP4 path")
    parser.add_argument("--voice", "-v", default=DEFAULT_VOICE, help=f"Voice name (default: {DEFAULT_VOICE})")
    parser.add_argument("--models-dir", default=DEFAULT_MODELS_DIR, help="Piper models directory")

    parser.add_argument("--video-method", default="ken_burns", choices=ai_method_choices,
                        help="Video generation method (default: ken_burns)")

    parser.add_argument("--effect", "-e", default="zoom_in",
                        choices=["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "drift"],
                        help="Ken Burns effect type (only used with --video-method ken_burns)")

    parser.add_argument("--ai-prompt", default="",
                        help="Motion prompt for AI video generation (used with AI video methods)")
    parser.add_argument("--motion-strength", type=int, default=127,
                        help="AI motion intensity 1-255 (default: 127, Wan only)")

    parser.add_argument("--resolution", "-r", default=DEFAULT_RESOLUTION, help=f"Output resolution (default: {DEFAULT_RESOLUTION})")
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS, help=f"Frame rate (default: {DEFAULT_FPS})")
    parser.add_argument("--background-audio", "-b", help="Optional background/ambient audio file")
    parser.add_argument("--background-volume", type=float, default=0.15, help="Background audio volume (0.0-1.0, default: 0.15)")
    parser.add_argument("--padding", type=float, default=3.0, help="Seconds of padding before/after narration (default: 3.0)")
    parser.add_argument("--list-voices", action="store_true", help="List available Piper TTS voices")
    parser.add_argument("--list-models", action="store_true", help="List available AI video models")

    args = parser.parse_args()

    if args.list_models:
        list_ai_models()
        return

    if args.list_voices:
        if os.path.exists(args.models_dir):
            print(f"Voices in {args.models_dir}:\n")
            for f in sorted(os.listdir(args.models_dir)):
                if f.endswith(".onnx"):
                    name = f.replace(".onnx", "")
                    size = os.path.getsize(os.path.join(args.models_dir, f))
                    print(f"  {name:30s}  ({size // 1024} KB)")
        else:
            print(f"Models directory not found: {args.models_dir}")
        return

    if not args.image:
        parser.error("--image is required (unless using --list-voices or --list-models)")

    if args.text_file:
        with open(args.text_file, "r") as f:
            narration_text = f.read().strip()
    elif args.text:
        narration_text = args.text
    else:
        parser.error("Either --text or --text-file is required")

    run_pipeline(
        image_path=args.image,
        narration_text=narration_text,
        output_path=args.output,
        voice_name=args.voice,
        models_dir=args.models_dir,
        video_method=args.video_method,
        effect=args.effect,
        resolution=args.resolution,
        fps=args.fps,
        background_audio=args.background_audio,
        background_volume=args.background_volume,
        padding=args.padding,
        ai_prompt=args.ai_prompt,
        motion_strength=args.motion_strength,
    )


if __name__ == "__main__":
    main()
