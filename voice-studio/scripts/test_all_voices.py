#!/usr/bin/env python3
"""
Test All Voices - Generate sample audio for each installed Piper voice model
Run this script to hear what each voice sounds like
"""

import os
import subprocess

# Configuration
MODELS_DIR = "/Users/gdv/Documents/P A U L   H I L S E/voice-studio/models"
AUDIO_DIR = "/Users/gdv/Documents/P A U L   H I L S E/voice-studio/audio"
PIPER_PYTHON = "/Users/gdv/paul-hilse-voice/venv/bin/python"

# Test phrase for each voice
TEST_PHRASE = "Antwerp, 1509. The son of a blacksmith picks up a brush."


def discover_voices():
    """Auto-discover all .onnx voice models in the models directory."""
    return [
        f.replace(".onnx", "")
        for f in sorted(os.listdir(MODELS_DIR))
        if f.endswith(".onnx") and not f.endswith(".json")
    ]


def test_voice(voice_name, output_path):
    """Generate a test audio file for a specific voice"""
    cmd = [
        PIPER_PYTHON,
        "-m", "piper",
        "-m", voice_name,
        "--data-dir", MODELS_DIR,
        "-f", output_path,
        "--text", TEST_PHRASE
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        size_kb = os.path.getsize(output_path) // 1024
        print(f"  {voice_name:30s} {size_kb:>5d} KB  ✅")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  {voice_name:30s}         ❌ {e.stderr.strip()[:60]}")
        return False


def main():
    voices = discover_voices()
    if not voices:
        print(f"No .onnx models found in {MODELS_DIR}")
        return

    print(f"Testing {len(voices)} installed Piper voices...")
    print(f"Test phrase: '{TEST_PHRASE}'")
    print(f"Models dir:  {MODELS_DIR}")
    print(f"Output dir:  {AUDIO_DIR}")
    print("-" * 55)

    os.makedirs(AUDIO_DIR, exist_ok=True)

    success = 0
    for voice_name in voices:
        # "en_US-amy-medium" -> "amy", "en_US-lessac-high" -> "lessac"
        parts = voice_name.split("-")
        short_name = parts[-2] if len(parts) >= 3 else voice_name
        output_path = os.path.join(AUDIO_DIR, f"test_{short_name}.wav")
        if test_voice(voice_name, output_path):
            success += 1

    print("-" * 55)
    print(f"Generated {success}/{len(voices)} voice samples")
    print(f"Files saved to: {AUDIO_DIR}")
    print("\nTo listen:")
    print(f"  afplay {AUDIO_DIR}/test_[name].wav")


if __name__ == "__main__":
    main()
