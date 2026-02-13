# Changelog

All notable changes to the "mmcif-rainbow" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Separated parser from token rendering for cleaner architecture (parser no longer depends on SemanticTokensBuilder)
- Unified `CategoryBlock` model replacing old `LoopBlock` with `isInLoopBlock` branching
- Improved color palette with explicit default colors (inspired by Rainbow CSV), preventing category-attribute color collision
- Switched dictionary build script from blacklist to whitelist approach, reducing asset size by 24% (5.4MB to 4.1MB)
- Removed CI cron schedule for dictionary updates (manual trigger only)
- Renamed internal `namesDefined` to `headerComplete` for clarity
- Removed side effects from token provider (decoration updates now managed by extension lifecycle)

### Fixed
- Multi-line string (`;...;`) hover now shows as a single unified tooltip instead of per-line
- Off-by-one error in cursor highlighting and hover bounds checks (`<=` to `<`)
- Imprecise category matching in pLDDT colorizer (`includes` to exact match)
- Memory leak in dictionary manager (document tracking not cleaned on close)

### Removed
- Deprecated `detectDictionaryType()` method (replaced by `detectDictionaryTypeFromDocument()`)
- Unused `type` field from `ItemDefinition` interface
- Unused `currentDocument` property from hover provider
- TextMate patterns for `loop_` keyword and `#` comment coloring (now use default text foreground)

## [0.0.8] - 2026-01-14

### Added
- Category Search ("Go to Category"): navigate between mmCIF categories using a searchable list
- CI/CD Workflow: restored automated build and release workflows

### Fixed
- Multi-line highlighting: corrected coloring for multi-line strings (`;...;`) in single-item sections
- Improved color consistency: adjusted rainbow color rotation logic for non-loop blocks

## [0.0.7] - 2026-01-14

### Changed
- Rollback and Recovery: reverted experimental WebAssembly parser due to stability issues, returned to pure TypeScript parser

## [0.0.6] - 2025-12-30

### Added
- ModelCIF dictionary support (`mmcif_ma.dic`) for AlphaFold and structure prediction tools with automatic detection via `_audit_conform.dict_name`
- pLDDT confidence coloring for `B_iso_or_equiv` values in AlphaFold model files

### Changed
- Reduced dictionary file sizes by ~40% (4.5MB to 2.8MB) by removing unnecessary metadata
- Split monolithic `features.ts` into focused modules

## [0.0.5] - 2025-12-26

### Added
- Enhanced dictionary hover with descriptions from mmCIF dictionary (pdbx-v50) and links to official documentation
- Context-aware hover: separate documentation for category names vs attribute names
- Dictionary automation: GitHub Actions pipeline for monthly dictionary updates via Pull Requests

### Changed
- Removed 5MB+ obsolete `.xsd` file and unnecessary directories, reducing extension size

## [0.0.4] - 2025-12-25

### Changed
- Added clarification about VS Code's 50MB file size limit for extensions

## [0.0.3] - 2025-12-25

### Changed
- Added file size limit (2MB) to prevent performance issues with large CIF files

## [0.0.2] - 2025-12-25

### Fixed
- Non-loop items (single key-value pairs) not cycling colors correctly

## [0.0.1] - 2025-12-25

### Added
- Initial release
- Rainbow column highlighting: semantic coloring for mmCIF `loop_` columns
- Cursor column highlighting: highlights entire column when cursor is on any part
- Hover support: shows full `_category.field` tag name when hovering over data values
- Support for multi-line strings (`;...;`) and quoted strings
