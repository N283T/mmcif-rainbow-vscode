# mmCIF Rainbow Columns (VS Code Extension)

This extension provides enhanced syntax highlighting and visual aids for **mmCIF** (Macromolecular Crystallographic Information File) files, widely used in structural biology.

It is designed to make reading and editing complex `loop_` blocks easier.

## Features

### 🌈 Rainbow Column Highlighting
Columns in `loop_` blocks are automatically colored to visually distinguish them.
- Each column (field name and its corresponding values) gets a unique color from a cycling rainbow palette.
- Helps quickly align keys with their values in large tables.

### 🔦 Cursor Column Highlighting
When you place your cursor on a field name or a data value:
- The **entire column** is highlighted (including the header and all data rows).
- This makes it easy to track which column a value belongs to or find all values for a specific field.
- Supports standard values and multi-line (`;...;`) strings.

### ℹ️ Hover Information
Hover over any data value in a loop to see its corresponding **Tag Name** (e.g., `_atom_site.id`).
- No more scrolling up to the header to check which field you are looking at!

## Installation

1. Install via the VS Code Marketplace (search for "mmCIF Rainbow").
2. In the new window, open a file (e.g. `examples/2hhb.cif`) and run the command:

   - **Command Palette** → `mmCIF Rainbow: Hello World`
3. Or build from source:
   ```bash
   npm install
   npm run compile
   ```

## Configuration

The extension uses Semantic Highlighting. You can customize the colors by adding the following to your VS Code `settings.json`:

```json
"editor.semanticTokenColorCustomizations": {
    "rules": {
        "rainbow1": "#ff0000",
        "rainbow2": "#ff7f00",
        // ... up to rainbow10
    }
}
```

## Contributing

Issues and Pull Requests are welcome!


