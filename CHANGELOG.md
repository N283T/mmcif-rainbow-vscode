# Change Log

All notable changes to the "mmcif-rainbow" extension will be documented in this file.

## [0.0.8] - 2026-01-14
### Added
- **Category Search ("Go to Category")**: Added a new command to quickly navigate between mmCIF categories using a searchable list (`Cmd+Shift+P` -> "mmCIF: Go to Category" or via context menu).
- **CI/CD Workflow**: Restored automated build and release workflows.

### Fixed
- **Multi-line Highlighting**: Corrected coloring for multi-line strings (`;...;`) in single-item sections to match their corresponding field names.
- **Improved Color Consistency**: Adjusted rainbow color rotation logic for better visual coherence in non-loop blocks.

## [0.0.7] - 2026-01-14
### Changed
- **Rollback and Recovery**: Reverted experimental WebAssembly (WASM) parser changes due to stability issues. Returned to the reliable pure TypeScript parser implementation from v0.0.6 as the new base.

## [0.0.6] - 2025-12-30
### Added
- **ModelCIF Dictionary Support**: Added support for `mmcif_ma.dic` (ModelCIF) dictionary used by AlphaFold and other structure prediction tools. The extension automatically detects the dictionary type from `_audit_conform.dict_name`.
- **pLDDT Confidence Coloring**: For AlphaFold model files, the `B_iso_or_equiv` column values are now colored according to pLDDT confidence scores:
  - 🔵 **> 90**: Very high confidence (dark blue `#0053D6`)
  - 🩵 **70-90**: Confident (light blue `#65CBF3`)
  - 🟡 **50-70**: Low confidence (yellow `#FFDB13`)
  - 🟠 **< 50**: Very low confidence (orange `#FF7D45`)

### Changed
- **Dictionary Size Optimization**: Reduced dictionary file sizes by ~40% (4.5MB → 2.8MB) by removing unnecessary metadata (version history, examples, internal relationships).
- **Internal Refactoring**: Split monolithic `features.ts` into focused modules for better maintainability.

## [0.0.5] - 2025-12-26
### Added
- **Enhanced Dictionary Hover**: Tooltips now display the value's **description** from the mmCIF dictionary (`pdbx-v50`), along with links to the official online documentation (`mmcif.wwpdb.org`).
- **Context-Aware Hover**: Hovering over category names (e.g., `_atom_site`) vs. attribute names (e.g., `id`) shows relevant documentation for each.
- **Dictionary Automation**: Implemented a CI/CD pipeline (GitHub Actions) to automatically update the dictionary file monthly via Pull Requests.

### Changed
- **Optimized Asset Size**: Removed 5MB+ obsolete `.xsd` file and unnecessary directories, significantly reducing extension size.
- **Internal**: Refactored hover provider logic for better maintainability.

## [0.0.4] - 2025-12-25
### Changed
- **Documentation Updated**: Added clarification about VS Code's 50MB file size limit for extensions.

## [0.0.3] - 2025-12-25
### Changed
- Added file size limit (2MB) to prevent performance issues with large CIF files. A warning will be shown if a file exceeds this limit.

## [0.0.2] - 2025-12-25
### Fixed
- Fixed a bug where non-loop items (single key-value pairs) were not cycling colors correctly.

## [0.0.1] - 2025-12-25
### Added
- Initial release.
- **Rainbow Column Highlighting**: Semantic coloring for mmCIF `loop_` columns.
- **Cursor Column Highlighting**: Highlights the entire column (header + values) when the cursor is on any part of it.
- **Hover Support**: Shows the full `_category.field` tag name when hovering over data values.
- Support for multi-line strings (`;...;`) and quoted strings.
