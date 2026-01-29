#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CARDS_PATH = PROJECT_ROOT / "cards" / "cards.json"
GEN_SCRIPT = PROJECT_ROOT / "scripts" / "generate_card_art.py"

TYPE_DIRS = {
    "creature": PROJECT_ROOT / "ui" / "assets" / "creatures",
    "spell": PROJECT_ROOT / "ui" / "assets" / "spells",
    "effect": PROJECT_ROOT / "ui" / "assets" / "effects",
    "mod": PROJECT_ROOT / "ui" / "assets" / "mods",
}

BOSS_DIR = PROJECT_ROOT / "ui" / "assets" / "boss"
BOSS_ART = {
    "Toad Bureaucrat": "toad_dark.jpg",
    "Clockwork King": "clockwork.jpg",
    "Ember Colossus": "ember_colossus.jpg",
    "Frost Warden": "frost_warden.jpg",
    "Ironbound Seraph": "ironbound_seraph.jpg",
    "Gravelord Mycel": "gravelord_mycel.jpg",
    "Stormglass Oracle": "stormglass_oracle.jpg",
    "Sunken Matron": "sunken_matron.jpg",
    "Ashen Pilgrim": "ashen_pilgrim.jpg",
    "Brass Leviathan": "brass_leviathan.jpg",
    "Hollow Regent": "hollow_regent.jpg",
}


def build_prompt(card: dict) -> str:
    name = card.get("name") or card.get("id", "Unknown")
    card_type = card.get("type", "card")
    if card_type == "creature":
        base = f"Fantasy creature illustration of {name}, full figure, dramatic lighting."
    elif card_type == "spell":
        base = f"Fantasy spell effect illustration for {name}, arcane energy, dramatic lighting."
    elif card_type == "effect":
        base = f"Fantasy effect emblem for {name}, banner or aura motif, dramatic lighting."
    elif card_type == "mod":
        base = f"Fantasy rune or charm illustration for {name}, engraved symbol, dramatic lighting."
    else:
        base = f"Fantasy card illustration for {name}, dramatic lighting."
    return base


def convert_to_jpeg(source: Path, dest: Path) -> None:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is required to convert to JPEG. Install with `python3 -m pip install pillow`."
        ) from exc

    with Image.open(source) as img:
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            background = Image.new("RGB", img.size, (0, 0, 0))
            alpha = img.split()[-1] if img.mode != "RGB" else None
            background.paste(img.convert("RGBA"), mask=alpha)
            img = background
        else:
            img = img.convert("RGB")
        img.save(dest, "JPEG", quality=90, optimize=True)


def build_boss_prompt(name: str) -> str:
    return f"Fantasy boss portrait of {name}, dramatic lighting, ominous atmosphere."


def run_generation(prompt: str, output_path: Path, env: dict) -> None:
    cmd = [sys.executable, str(GEN_SCRIPT), prompt, str(output_path)]
    subprocess.run(cmd, check=True, env=env, cwd=str(PROJECT_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Populate missing card art assets using generate_card_art.py."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate art even if the JPEG already exists.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Only generate up to N images (0 = no limit).",
    )
    parser.add_argument(
        "--types",
        nargs="*",
        default=[],
        help="Optional list of card types to include (creature, spell, effect, mod).",
    )
    parser.add_argument(
        "--bosses",
        action="store_true",
        help="Also generate missing boss art for known bosses.",
    )
    parser.add_argument(
        "--bosses-only",
        action="store_true",
        help="Only generate boss art, skipping card art.",
    )
    args = parser.parse_args()

    if not CARDS_PATH.exists():
        print(f"Missing card library at {CARDS_PATH}", file=sys.stderr)
        return 1
    if not GEN_SCRIPT.exists():
        print(f"Missing generator script at {GEN_SCRIPT}", file=sys.stderr)
        return 1

    with CARDS_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    cards = data.get("cards", [])

    allowed_types = set(args.types) if args.types else set(TYPE_DIRS.keys())
    remaining = args.limit if args.limit and args.limit > 0 else None

    env = os.environ.copy()
    env.setdefault("OPENAI_IMAGE_FORMAT", "png")

    generated = 0
    skipped = 0
    if not args.bosses_only:
        for card in cards:
            card_type = card.get("type")
            if card_type not in allowed_types:
                continue
            target_dir = TYPE_DIRS.get(card_type)
            if not target_dir:
                continue
            target_dir.mkdir(parents=True, exist_ok=True)

            card_id = card.get("id")
            if not card_id:
                continue
            dest = target_dir / f"{card_id}.jpg"
            if dest.exists() and not args.force:
                skipped += 1
                continue

            prompt = build_prompt(card)
            temp_png = target_dir / f"{card_id}.png"
            try:
                run_generation(prompt, temp_png, env)
                convert_to_jpeg(temp_png, dest)
                temp_png.unlink(missing_ok=True)
                generated += 1
            except Exception as exc:
                print(f"Failed to generate art for {card_id}: {exc}", file=sys.stderr)
                if temp_png.exists():
                    temp_png.unlink(missing_ok=True)
                continue

            if remaining is not None:
                remaining -= 1
                if remaining <= 0:
                    break

    if remaining is None or remaining > 0:
        if args.bosses or args.bosses_only:
            BOSS_DIR.mkdir(parents=True, exist_ok=True)
            for boss_name, filename in BOSS_ART.items():
                dest = BOSS_DIR / filename
                if dest.exists() and not args.force:
                    skipped += 1
                    continue

                prompt = build_boss_prompt(boss_name)
                temp_png = BOSS_DIR / f"{dest.stem}.png"
                try:
                    run_generation(prompt, temp_png, env)
                    convert_to_jpeg(temp_png, dest)
                    temp_png.unlink(missing_ok=True)
                    generated += 1
                except Exception as exc:
                    print(f"Failed to generate art for boss {boss_name}: {exc}", file=sys.stderr)
                    if temp_png.exists():
                        temp_png.unlink(missing_ok=True)
                    continue

                if remaining is not None:
                    remaining -= 1
                    if remaining <= 0:
                        break

    print(f"Generated: {generated}, skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
