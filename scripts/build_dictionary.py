
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

# URL for the dictionary (v50)
DIC_URL = "https://mmcif.wwpdb.org/dictionaries/ascii/mmcif_pdbx_v50.dic.gz"
LOCAL_DIC_PATH = "mmcif_pdbx_v50.dic.gz"
OUTPUT_PATH = "assets/mmcif_pdbx_v50.dic.json"

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
    if not text: return text
    
    # Remove CIF delimiters if present
    text = text.strip()
    if text.startswith(';') and text.endswith(';'):
        text = text[1:-1]
    
    # Split into paragraphs by blank lines
    lines = text.split('\n')
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
            l.startswith(('-', '*', '•', 'Ref:')) or ' = ' in l 
            for l in p_lines
        )
        
        if is_list:
            # Preserve structure: join with newline, normalize internal spaces
            cleaned_p = "\n".join([re.sub(r'\s+', ' ', l) for l in p_lines])
        else:
            # Reflow: join with space, normalize
            full_text = " ".join(p_lines)
            cleaned_p = re.sub(r'\s+', ' ', full_text)
            
        cleaned_paragraphs.append(cleaned_p)
        
    return "\n\n".join(cleaned_paragraphs)

def main():
    print(f"Downloading dictionary from {DIC_URL}...")
    try:
        urllib.request.urlretrieve(DIC_URL, LOCAL_DIC_PATH)
    except Exception as e:
        print(f"Error downloading dictionary: {e}")
        sys.exit(1)

    print(f"Parsing dictionary with gemmi...")
    try:
        doc = gemmi.cif.read(LOCAL_DIC_PATH)
        # as_json() returns a string. We replace newlines to make the JSON itself compact if needed, 
        # though standard json.dump indent=None does that too. 
        # doc.as_json() avoids strictly preserving CIF structure if simple=True? 
        # Default as_json() preserves structure.
        json_string = doc.as_json() 
        json_data = json.loads(json_string)
    except Exception as e:
        print(f"Error parsing dictionary: {e}")
        sys.exit(1)

    print("Cleaning strings...")
    cleaned_data = clean_strings(json_data)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    print(f"Saving to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w") as f:
        # Save as minified JSON (no indent) to save space
        json.dump(cleaned_data, f, separators=(',', ':'))

    print("Done.")
    
    # Cleanup downloaded file
    if os.path.exists(LOCAL_DIC_PATH):
        os.remove(LOCAL_DIC_PATH)

if __name__ == "__main__":
    main()
