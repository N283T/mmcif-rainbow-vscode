# Change Log

All notable changes to the "mmcif-rainbow" extension will be documented in this file.

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
