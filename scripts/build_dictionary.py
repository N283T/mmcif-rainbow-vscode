# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "gemmi",
# ]
# ///

import gemmi
import json
import re
import os
import urllib.request
import sys

# Dictionary configurations
DICTIONARIES = [
    {
        "name": "mmcif_pdbx_v50",
        "url": "https://mmcif.wwpdb.org/dictionaries/ascii/mmcif_pdbx_v50.dic.gz",
        "local_path": "mmcif_pdbx_v50.dic.gz",
        "output_path": "assets/mmcif_pdbx_v50.dic.json",
    },
    {
        "name": "mmcif_ma",
        "url": "https://raw.githubusercontent.com/ihmwg/ModelCIF/master/dist/mmcif_ma.dic",
        "local_path": "mmcif_ma.dic",
        "output_path": "assets/mmcif_ma.dic.json",
    },
]


def filter_dictionary(data):
    """Keep only the fields needed for hover display (whitelist approach)."""
    # Only keep frame keys that dictionary.ts actually uses
    frame_keys_to_keep = {
        "_category.id",
        "_category.description",
        "_item.name",
        "_item.category_id",
        "_item_description.description",
    }

    def filter_frame(frame):
        """Keep only whitelisted keys from a frame."""
        return {k: v for k, v in frame.items() if k in frame_keys_to_keep}

    if isinstance(data, dict):
        filtered = {}
        for key, value in data.items():
            if isinstance(value, dict):
                inner_filtered = {}
                for k, v in value.items():
                    if k == "Frames" and isinstance(v, dict):
                        inner_filtered[k] = {
                            frame_name: filter_frame(frame)
                            for frame_name, frame in v.items()
                            if any(fk in frame for fk in frame_keys_to_keep)
                        }
                    # Skip all top-level non-Frames keys (history, metadata, etc.)
                filtered[key] = inner_filtered
            else:
                filtered[key] = value
        return filtered
    return data


def clean_strings(obj):
    """Recursively clean strings, preserving paragraph structure."""
    if isinstance(obj, dict):
        return {key: clean_strings(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [clean_strings(item) for item in obj]
    elif isinstance(obj, str):
        return smart_clean_text(obj)
    else:
        return obj


def smart_clean_text(text):
    if not text:
        return text

    # Remove CIF delimiters if present
    text = text.strip()
    if text.startswith(";") and text.endswith(";"):
        text = text[1:-1]

    # Split into paragraphs by blank lines
    lines = text.split("\n")
    paragraphs = []
    current_paragraph = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_paragraph:
                paragraphs.append(current_paragraph)
                current_paragraph = []
        else:
            current_paragraph.append(stripped)

    if current_paragraph:
        paragraphs.append(current_paragraph)

    cleaned_paragraphs = []
    for p_lines in paragraphs:
        # Heuristic: Detect lists/tables to preserve newlines
        # Look for lines starting with markers or containing " = "
        is_list = len(p_lines) > 1 and any(
            l.startswith(("-", "*", "•", "Ref:")) or " = " in l for l in p_lines
        )

        if is_list:
            # Preserve structure: join with newline, normalize internal spaces
            cleaned_p = "\n".join([re.sub(r"\s+", " ", l) for l in p_lines])
        else:
            # Reflow: join with space, normalize
            full_text = " ".join(p_lines)
            cleaned_p = re.sub(r"\s+", " ", full_text)

        cleaned_paragraphs.append(cleaned_p)

    return "\n\n".join(cleaned_paragraphs)


def process_dictionary(config):
    """Download, parse, clean and save a single dictionary."""
    name = config["name"]
    url = config["url"]
    local_path = config["local_path"]
    output_path = config["output_path"]

    print(f"\n=== Processing {name} ===")
    print(f"Downloading from {url}...")
    try:
        urllib.request.urlretrieve(url, local_path)
    except Exception as e:
        print(f"Error downloading dictionary: {e}")
        return False

    print(f"Parsing dictionary with gemmi...")
    try:
        doc = gemmi.cif.read(local_path)
        json_string = doc.as_json()
        json_data = json.loads(json_string)
    except Exception as e:
        print(f"Error parsing dictionary: {e}")
        return False

    print("Cleaning strings...")
    cleaned_data = clean_strings(json_data)

    print("Filtering unnecessary metadata...")
    filtered_data = filter_dictionary(cleaned_data)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"Saving to {output_path}...")
    with open(output_path, "w") as f:
        json.dump(filtered_data, f, separators=(",", ":"))

    # Get file size
    size = os.path.getsize(output_path)
    print(f"Done. Output size: {size / 1024 / 1024:.2f} MB")

    # Cleanup downloaded file
    if os.path.exists(local_path):
        os.remove(local_path)

    return True


def main():
    success_count = 0
    for config in DICTIONARIES:
        if process_dictionary(config):
            success_count += 1

    print(
        f"\n=== Completed: {success_count}/{len(DICTIONARIES)} dictionaries processed ==="
    )

    if success_count != len(DICTIONARIES):
        sys.exit(1)


if __name__ == "__main__":
    main()
