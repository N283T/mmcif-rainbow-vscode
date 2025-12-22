# mmCIF Rainbow Columns (VS Code Extension)

This is a VS Code extension that will add column-based coloring for mmCIF `loop_` data.

## Running the extension

1. Install dependencies:

   ```bash
   npm install
   ```

2. Press `F5` in VS Code to launch the Extension Development Host.

3. In the new window, open a file (e.g. `.cif`) and run the command:

   - **Command Palette** → `mmCIF Rainbow: Hello World`

You should see a notification message from the extension.

## Features

- mmCIF language basics:
  - File associations: `.cif`, `.mmcif`
  - Syntax hints for `loop_`, `data_`, tags (`_...`), and `#` comments
- Column-based semantic coloring for `loop_` tables (first 8 columns get distinct colors)

## Notes

- Colors are provided via semantic tokens (`cifColumn1` .. `cifColumn8`) with defaults in configuration defaults.
- If you prefer different colors, override in settings:

  ```jsonc
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "cifColumn1": "#ff6666",
      "cifColumn2": "#ff9966"
    }
  }
  ```


