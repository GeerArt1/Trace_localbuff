#!/usr/bin/env python3
"""
Generate AI video clips for the Van Eyck → Matsys brush handoff scene.
Uses FAL.ai with selectable model (Wan 2.1 or Hailuo/MiniMax).

Usage:
    python generate_scene.py                    # Default: Wan 2.1
    python generate_scene.py --model hailuo     # Hailuo 2.3 Pro
    python generate_scene.py --model hailuo-fast # Hailuo 2.3 Fast
    python generate_scene.py --model hailuo-02  # Hailuo 02
    python generate_scene.py --list-models      # Show available models
"""

import argparse
import base64
import os
import sys
import json
import requests
from pathlib import Path

# Configuration
OUTPUT_DIR = Path("/Users/gdv/Documents/P A U L   H I L S E/voice-studio/audio")

# AI Video Model Registry
AI_MODELS = {
    "wan": {
        "slug": "fal-ai/wan-i2v",
        "label": "Wan 2.1",
        "cost": 0.25,
        "num_frames": 81,
        "supports_motion_strength": True,
    },
    "hailuo": {
        "slug": "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
        "label": "Hailuo 2.3 Pro",
        "cost": 0.49,
        "num_frames": 81,
        "supports_motion_strength": False,
    },
    "hailuo-fast": {
        "slug": "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video",
        "label": "Hailuo 2.3 Fast",
        "cost": 0.25,
        "num_frames": 81,
        "supports_motion_strength": False,
    },
    "hailuo-02": {
        "slug": "fal-ai/minimax/hailuo-02/standard/image-to-video",
        "label": "Hailuo 02",
        "cost": 0.30,
        "num_frames": 81,
        "supports_motion_strength": False,
    },
}
DEFAULT_MODEL = "wan"

# Scene prompts based on attributed self-portraits
SCENES = [
    {
        "name": "van_eyck_passing",
        "prompt": (
            "Cinematic 4K video, 8 seconds, slow dolly-in. Flemish Baroque workshop, Antwerp 16th century, interior candlelight. "
            "An OLDER man in his late 40s with short dark hair, wearing a voluminous bright red turban/chaperon and dark fur-lined robe "
            "(based on Jan van Eyck's attributed self-portrait 'Man in a Red Turban', 1433, National Gallery London). "
            "He stands in a dimly lit workshop, holding a long wooden paintbrush in his right hand, arm extended forward. "
            "He is seen from BEHIND or in THREE-QUARTER PROFILE, never frontally. His face is in DEEP SHADOW, "
            "a silhouette against warm candle light. The viewer senses a master passing something of meaning. "
            "The brush is the only brightly-lit object, lit from above by candle. "
            "Lighting: Two candles on a wooden bench, warm amber key light from right, cool blue-grey fill from small leaded window on left. "
            "Chiaroscuro. Roger Deakins cinematography, Caravaggio lighting, period film grain, subtle 35mm look. "
            "Style: deep blacks, oxblood reds, warm amber. No neon, no oversaturation. "
            "NEGATIVE: frontal face, sharp face focus, eye contact with camera, smiling, modern skin texture, "
            "smartphone, electric light, neon, anachronism, bright sunshine, casual posture, text, watermark."
        ),
        "output": "clip_van_eyck.mp4"
    },
    {
        "name": "matsys_receiving",
        "prompt": (
            "Cinematic 4K video, 8 seconds, slow dolly-in. Flemish Baroque workshop, Antwerp 16th century, interior candlelight. "
            "A YOUNGER man in his early 30s, lean, wearing a fur-trimmed deep crimson houppelande and soft red cloth cap "
            "(based on Quinten Matsys, the blacksmith's son of Antwerp, Flemish Renaissance artisan). "
            "He reaches with his right hand to receive a long wooden paintbrush from an older master. "
            "He is seen from BEHIND or in THREE-QUARTER PROFILE, never frontally. His face is in DEEP SHADOW, "
            "a silhouette against warm candle light. The viewer senses a younger man receiving a sacred inheritance. "
            "The brush is the only brightly-lit object, lit from above by candle. "
            "Lighting: Two candles on a wooden bench, warm amber key light from right, cool blue-grey fill from small leaded window on left. "
            "Chiaroscuro. Roger Deakins cinematography, Caravaggio lighting, period film grain, subtle 35mm look. "
            "Style: deep blacks, oxblood reds, warm amber. No neon, no oversaturation. "
            "NEGATIVE: frontal face, sharp face focus, eye contact with camera, smiling, modern skin texture, "
            "smartphone, electric light, neon, anachronism, bright sunshine, casual posture, text, watermark."
        ),
        "output": "clip_matsys.mp4"
    }
]


def generate_clip(scene: dict, image_path: str = None, model_key: str = DEFAULT_MODEL) -> str:
    """Generate a video clip using FAL.ai with selectable model."""
    import fal_client

    fal_key = os.environ.get("FAL_KEY")
    if not fal_key:
        print("❌ FAL_KEY environment variable not set.")
        print("   Get yours at: https://fal.ai/dashboard/keys")
        print("   Then: export FAL_KEY=your_key_here")
        return None

    if model_key not in AI_MODELS:
        available = ", ".join(AI_MODELS.keys())
        print(f"❌ Unknown model '{model_key}'. Available: {available}")
        return None
    model_info = AI_MODELS[model_key]

    print(f"\n{'='*60}")
    print(f"Generating: {scene['name']}")
    print(f"Model:      {model_info['label']} (~${model_info['cost']:.2f})")
    print(f"{'='*60}")
    print(f"Prompt: {scene['prompt'][:100]}...")

    try:
        arguments = {
            "prompt": scene["prompt"],
            "num_frames": model_info["num_frames"],
        }

        # Image-to-video or text-to-video
        if image_path and os.path.exists(image_path):
            print(f"Using image reference: {image_path}")
            # Encode local image as base64 data URI (FAL.ai is a cloud API)
            with open(image_path, "rb") as f:
                image_data = f.read()
            ext = os.path.splitext(image_path)[1].lower()
            mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
            mime = mime_map.get(ext, "image/jpeg")
            arguments["image_url"] = f"data:{mime};base64,{base64.b64encode(image_data).decode()}"
            if model_info["supports_motion_strength"]:
                arguments["guidance_scale"] = 5.0
                arguments["motion_strength"] = 127
        else:
            print("Using text-to-video (no image reference)")
            if model_info["supports_motion_strength"]:
                arguments["guidance_scale"] = 5.0

        result = fal_client.run(
            model_info["slug"],
            arguments=arguments,
        )

        # Download the video
        video_url = result.get("video", {}).get("url") or result.get("video_url")
        if not video_url:
            print(f"Unexpected result: {json.dumps(result, indent=2)}")
            return None

        output_path = OUTPUT_DIR / scene["output"]
        print(f"Downloading from: {video_url[:80]}...")

        response = requests.get(video_url, stream=True)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = output_path.stat().st_size / 1024 / 1024
        print(f"✅ Saved: {output_path} ({file_size:.1f} MB)")
        return str(output_path)

    except Exception as e:
        print(f"❌ Error generating {scene['name']}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI video clips for the Van Eyck → Matsys scene",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\nVideo models:
  wan         Wan 2.1 image-to-video (~$0.25, default)
  hailuo      Hailuo 2.3 Pro image-to-video (~$0.49)
  hailuo-fast Hailuo 2.3 Fast image-to-video (~$0.25)
  hailuo-02   Hailuo 02 image-to-video (~$0.30)

All models require FAL_KEY environment variable.
Get yours at: https://fal.ai/dashboard/keys
""",
    )
    parser.add_argument("--image", "-i", help="Reference image for image-to-video generation")
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL,
                        choices=list(AI_MODELS.keys()),
                        help=f"AI video model to use (default: {DEFAULT_MODEL})")
    parser.add_argument("--list-models", action="store_true", help="List available models")
    args = parser.parse_args()

    if args.list_models:
        print("Available models:\n")
        print(f"  {'Key':<15} {'Model':<30} {'Cost':<10}")
        print("  " + "-" * 55)
        for key, info in AI_MODELS.items():
            print(f"  {key:<15} {info['label']:<30} ~${info['cost']:.2f}")
        return

    results = []
    for scene in SCENES:
        result = generate_clip(scene, args.image, model_key=args.model)
        results.append((scene["name"], result))

    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    total_cost = 0
    for name, path in results:
        status = "✅" if path else "❌"
        print(f"{status} {name}: {path or 'FAILED'}")
        if path:
            total_cost += AI_MODELS[args.model]["cost"]
    if total_cost > 0:
        print(f"\n  Total estimated cost: ~${total_cost:.2f}")


if __name__ == "__main__":
    main()
