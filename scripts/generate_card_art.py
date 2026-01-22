#!/usr/bin/env python3
import base64
import os
import sys

from openai import OpenAI


def main() -> int:
    if "OPENAI_API_KEY" not in os.environ:
        print("Missing OPENAI_API_KEY environment variable.", file=sys.stderr)
        return 1

    setting_prompt = "draw in landscape. merged with dark background shadows, dramatic lighting. In the style of luminous pop-fantasy, digital gouache painting, thick expressive brushstrokes, volumetric lighting, rim lighting, cel-shaded, high contrast, vibrant jewel tones, tactile toy-like texture --no text"
    prompt = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Paint a fantasy card illustration of a towering behemoth, dramatic lighting, dark background."
    )
    if setting_prompt.strip():
        prompt = f"{prompt}\n\n{setting_prompt}"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "behemoth.png"

    size = os.getenv("OPENAI_IMAGE_SIZE", "1024x1024")
    quality = os.getenv("OPENAI_IMAGE_QUALITY", "high")
    output_format = os.getenv("OPENAI_IMAGE_FORMAT", "png")

    client = OpenAI()
    print(f"Generating: {output_path} — {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
    response = client.responses.create(
        model="gpt-5",
        input=prompt,
        tools=[
            {
                "type": "image_generation",
                "size": size,
                "quality": quality,
                "output_format": output_format,
            }
        ],
    )

    image_data = [
        output.result
        for output in response.output
        if output.type == "image_generation_call"
    ]
    if not image_data:
        print("No image data returned by the API.", file=sys.stderr)
        return 1

    with open(output_path, "wb") as f:
        f.write(base64.b64decode(image_data[0]))

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
