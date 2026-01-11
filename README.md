# Rainbow mmCIF (VS Code Extension)

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=N283T.mmcif-rainbow)

![Rainbow Overview](resources/overview.png)

This extension provides enhanced syntax highlighting and visual aids for **mmCIF** (Macromolecular Crystallographic Information File) files, widely used in structural biology. 

It is designed to make reading and editing complex mmCIF files effortless. Unlike standard syntax highlighters, this extension focuses on human-readable visualization of data blocks, inspired by [Rainbow CSV](https://github.com/mechatroner/vscode_rainbow_csv).

## Features

### 🌈 Rainbow Block Highlighting

![Rainbow Demo](resources/rainbow_mmcif_movie_01.gif)

All data items—whether in a `loop_` or a single-item section—are treated as a unified **Block**.
- **Category** (e.g., `_atom_site`) and **Item** (e.g., `.id`) are clearly distinguished.
- Columns are automatically colored using a cycling rainbow palette to help you quickly align keys with their values.

![Atomsite Overview](resources/overview_atomsite.png)

---

### ℹ️ Integrated Dictionary Hover

![Hover Demo](resources/rainbow_mmcif_movie_02.gif)

Gain instant access to the official PDBx/mmCIF dictionary metadata. Hover over any Category, Item, or data value to see its definition.
- **Context-Aware**: Dynamically displays documentation based on whether you hover over a **Category**, **Item**, or **Value**.
- **Direct Links**: Quick navigation to official wwPDB documentation for every tag.

#### Hover Format Examples

**For Category:**

![Hover Category](resources/hover_category.png)

```
### _category_name
[Online Documentation](...)

---
Category Description...
```

**For Item:**

![Hover Item](resources/hover_item.png)

```
### _category_name.item_name
[Online Documentation](...)

---
Category : category_name
Attribute : attribute_name

---
Item Description...
```

**For Value:**

![Hover Value](resources/hover_value.png)

```
### _category_name.item_name
```

---

### 🔦 Interactive Highlighting

![Interactive Demo](resources/rainbow_mmcif_movie_03.gif)

Highlight an entire column by placing your cursor on any part of it. This tracking makes it impossible to lose your place in dense data tables.

![Column Focus 1](resources/highlight_01.png)

![Column Focus 2](resources/highlight_02.png)

---

### 🧬 AlphaFold / ModelCIF Support

![pLDDT Coloring](resources/plddt.png)

This extension provides specialized support for **AlphaFold** and other structure prediction model files that use the **ModelCIF** dictionary (`mmcif_ma.dic`).

#### Automatic Dictionary Detection

The extension automatically detects the dictionary type by reading `_audit_conform.dict_name`:
- **PDBx/mmCIF** (`mmcif_pdbx_v50.dic`) - Standard experimental structures
- **ModelCIF** (`mmcif_ma.dic`) - AlphaFold, ESMFold, and other predicted structures

#### pLDDT Confidence Coloring

For ModelCIF files, the `B_iso_or_equiv` column (which stores pLDDT scores in AlphaFold models) is automatically colored according to confidence levels:

| pLDDT Score | Color | Confidence |
|-------------|-------|------------|
| > 90 | 🔵 Dark Blue (`#0053D6`) | Very high |
| 70-90 | 🩵 Light Blue (`#65CBF3`) | Confident |
| 50-70 | 🟡 Yellow (`#FFDB13`) | Low |
| < 50 | 🟠 Orange (`#FF7D45`) | Very low |

This matches the standard AlphaFold color scheme, making it easy to visually assess model quality directly in your editor.

---

### 🔍 Category Search

<!-- ![Search Demo](resources/search_demo.gif) -->

Quickly jump to any category in large mmCIF files.

**How to use:**
- Right-click in the editor and select **mmCIF: Go to Category...**
- Or press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Win/Linux) and run the command.

Select a category from the list to instantly scroll to it. The target will be highlighted to help you spot it immediately.

---

## Installation

1. **[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=N283T.mmcif-rainbow)**
2. Open any `.cif` or `.mmcif` file. Highlighting and hover features will activate automatically.
3. Or build from source (Git submodules required):
   ```bash
   git clone --recursive https://github.com/N283T/mmcif-rainbow-vscode.git
   cd mmcif-rainbow-vscode
   npm install
   npm run compile
   ```

## Limitations

- **File Size Limit**: Due to VS Code's internal API limitations, extensions cannot access the content of files larger than approximately **50MB**. For these massive files, rainbow coloring and hover features will be disabled.

## Contributing

Issues and Pull Requests are welcome!
