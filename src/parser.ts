import * as vscode from 'vscode';
import { RAINBOW_COLOR_COUNT } from './constants';
import { Logger } from './logger';

// --- Public interfaces (consumed by all downstream features) ---

export interface FieldDef {
    /** Line number where this field name appears */
    line: number;
    /** Character offset of the field name (after the dot) */
    start: number;
    /** Length of the field name */
    length: number;
    /** Field name without category prefix, e.g. "id" from "_entry.id" */
    fieldName: string;
}

export interface ValueRange {
    /** Character offset within the line */
    start: number;
    /** Length of the value text */
    length: number;
    /** Column index (matches fieldNames index) */
    columnIndex: number;
}

export interface DataRow {
    /** Line number */
    line: number;
    /** Value positions on this line */
    valueRanges: ValueRange[];
    /** If part of a multi-line string (;...;), the full line range */
    multiLineRange?: { startLine: number; endLine: number };
}

/**
 * Represents a unified category block, either from a loop_ or from
 * grouped non-loop tag-value pairs of the same category.
 *
 * For loop_ blocks: multiple rows, columns defined by loop headers.
 * For non-loop pairs: typically one row, each pair becomes one column.
 * Consumers never need to distinguish between the two.
 */
export interface CategoryBlock {
    /** Line where the block starts (loop_ keyword or first pair) */
    startLine: number;
    /** Category name including leading underscore, e.g. "_entry" */
    categoryName: string;
    /** Column definitions */
    fieldNames: FieldDef[];
    /** Data rows */
    dataRows: DataRow[];
}

// --- Parser internals ---

interface ParserBlock {
    startLine: number;
    categoryName: string;
    fieldNames: FieldDef[];
    dataRows: DataRow[];
    isLoop: boolean;
    namesDefined: boolean;
    processedValueCount: number;
}

export class CifParser {
    /**
     * Split a line into tokens, handling quoted strings correctly.
     */
    public specialSplit(content: string): Array<[string, boolean]> {
        const output: Array<[string, boolean]> = [["", false]];
        let quote = false;
        let qtype: string | null = null;
        const length = content.length;
        let olast = 0;

        for (let i = 0; i < length; i++) {
            const isWS = content[i] === " " || content[i] === "\t";
            const char = content[i];

            if (
                (char === "'" || char === '"') &&
                (i === 0 ||
                    content[i - 1] === " " ||
                    content[i - 1] === "\t" ||
                    i === length - 1 ||
                    content[i + 1] === " " ||
                    content[i + 1] === "\t") &&
                (!quote || char === qtype)
            ) {
                quote = !quote;
                qtype = quote ? char : null;
                output[olast][0] += char;
                output[olast][1] = true;
            } else if (!quote && isWS && output[olast][0] !== "") {
                output.push(["", false]);
                olast++;
            } else if (!quote && char === "#") {
                break;
            } else if (!isWS || quote) {
                output[olast][0] += char;
                if (quote) {
                    output[olast][1] = true;
                }
            }
        }

        if (output[olast][0] === "") {
            output.pop();
        }

        return output;
    }

    public isDataName(token: [string, boolean]): boolean {
        return token[0].startsWith("_") && !token[1];
    }

    public isLoopKeyword(token: [string, boolean]): boolean {
        return token[0] === "loop_" && !token[1];
    }

    public isBlockKeyword(token: [string, boolean]): boolean {
        if (token[1]) return false;
        const text = token[0];
        return (
            text === "global_" ||
            text.startsWith("data_") ||
            text.startsWith("save_")
        );
    }

    public parseBlocks(document: vscode.TextDocument, builder?: vscode.SemanticTokensBuilder): CategoryBlock[] {
        try {
            return this.doParseBlocks(document, builder);
        } catch (error) {
            Logger.getInstance().error('Error parsing document', error);
            return [];
        }
    }

    private emitBlock(block: ParserBlock): CategoryBlock {
        return {
            startLine: block.startLine,
            categoryName: block.categoryName,
            fieldNames: block.fieldNames,
            dataRows: block.dataRows,
        };
    }

    private doParseBlocks(document: vscode.TextDocument, builder?: vscode.SemanticTokensBuilder): CategoryBlock[] {
        const blocks: CategoryBlock[] = [];
        let current: ParserBlock | null = null;
        let multiLineMode = false;
        let multiLineStartLine = -1;
        let multiLineDataRowStartIdx = -1;

        const emitCurrent = () => {
            if (current && current.fieldNames.length > 0) {
                blocks.push(this.emitBlock(current));
            }
            current = null;
        };

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const lineText = line.text;
            const firstChar = lineText.length > 0 ? lineText[0] : "";

            // Skip comment lines
            if (firstChar === "#") {
                if (current && current.fieldNames.length > 0 && current.namesDefined) {
                    emitCurrent();
                }
                continue;
            }

            // Handle multi-line strings (; ... ;)
            if (firstChar === ";") {
                if (multiLineMode) {
                    // End of multi-line string
                    multiLineMode = false;
                    if (current) {
                        const colIndex = this.currentColumnIndex(current);
                        const tokenTypeIndex = 1 + (colIndex % RAINBOW_COLOR_COUNT);

                        current.dataRows.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });
                        current.processedValueCount++;

                        // Set multiLineRange on all rows in this multi-line block
                        if (multiLineDataRowStartIdx >= 0) {
                            const range = { startLine: multiLineStartLine, endLine: i };
                            for (let j = multiLineDataRowStartIdx; j < current.dataRows.length; j++) {
                                current.dataRows[j].multiLineRange = range;
                            }
                        }

                        if (builder) { builder.push(i, 0, lineText.length, tokenTypeIndex, 0); }
                    }
                    if (current && current.fieldNames.length > 0) {
                        current.namesDefined = true;
                    }
                } else {
                    // Start of multi-line string
                    multiLineMode = true;
                    multiLineStartLine = i;
                    multiLineDataRowStartIdx = current ? current.dataRows.length : -1;
                    if (current) {
                        const colIndex = this.currentColumnIndex(current);
                        const tokenTypeIndex = 1 + (colIndex % RAINBOW_COLOR_COUNT);

                        current.dataRows.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });

                        if (builder) { builder.push(i, 0, lineText.length, tokenTypeIndex, 0); }
                    }
                }
                continue;
            }

            if (multiLineMode) {
                // Inside a multi-line string
                if (current) {
                    const colIndex = this.currentColumnIndex(current);

                    current.dataRows.push({
                        line: i,
                        valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                    });

                    if (builder && lineText.length > 0) {
                        const tokenTypeIndex = 1 + (colIndex % RAINBOW_COLOR_COUNT);
                        builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                    }
                }
                continue;
            }

            const trimmed = lineText.trim();
            if (trimmed === "") {
                if (current && current.fieldNames.length > 0 && !current.namesDefined) {
                    current.namesDefined = true;
                }
                continue;
            }

            const tokens = this.specialSplit(trimmed);
            if (tokens.length === 0) continue;

            // Block keywords (data_, save_, global_)
            if (this.isBlockKeyword(tokens[0])) {
                emitCurrent();
                continue;
            }

            // loop_ keyword
            if (this.isLoopKeyword(tokens[0])) {
                emitCurrent();
                current = {
                    startLine: i,
                    categoryName: "",
                    fieldNames: [],
                    dataRows: [],
                    isLoop: true,
                    namesDefined: false,
                    processedValueCount: 0,
                };
                continue;
            }

            // Data name (_category.field)
            if (this.isDataName(tokens[0])) {
                const dataName = tokens[0][0];
                const match = dataName.match(/^(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)$/);

                if (match) {
                    const categoryName = match[1];
                    const fieldName = match[2];

                    const categoryMatch = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)/);
                    if (!categoryMatch) continue;

                    const leadingSpaces = categoryMatch[1]?.length || 0;
                    const fieldStart = leadingSpaces + categoryName.length + 1;
                    const fieldLength = fieldName.length;

                    // Decide whether to emit the current block and start a new one
                    if (current) {
                        if (current.isLoop) {
                            // Inside a loop_ block
                            if (current.namesDefined) {
                                // New data name after data rows means new block
                                emitCurrent();
                            } else if (current.categoryName && current.categoryName !== categoryName) {
                                // Different category in loop headers -> new block
                                emitCurrent();
                            }
                        } else {
                            // Non-loop: group consecutive same-category items
                            if (current.categoryName !== categoryName) {
                                emitCurrent();
                            }
                        }
                    }

                    // Create new block if needed
                    if (!current) {
                        current = {
                            startLine: i,
                            categoryName: categoryName,
                            fieldNames: [],
                            dataRows: [],
                            isLoop: false,
                            namesDefined: false,
                            processedValueCount: 0,
                        };
                    }

                    if (!current.categoryName) {
                        current.categoryName = categoryName;
                    }

                    // Add field definition
                    const columnIndex = current.fieldNames.length;
                    current.fieldNames.push({
                        line: i,
                        start: fieldStart,
                        length: fieldLength,
                        fieldName: fieldName,
                    });

                    // For non-loop blocks, inline values on the same line become data
                    if (!current.isLoop && tokens.length > 1) {
                        const valueRanges: ValueRange[] = [];
                        let searchStart = categoryMatch.index! + categoryMatch[0].length;

                        for (let col = 1; col < tokens.length; col++) {
                            const tokenText = tokens[col][0];
                            if (!tokenText) continue;
                            const idx = lineText.indexOf(tokenText, searchStart);
                            if (idx === -1) continue;

                            valueRanges.push({
                                start: idx,
                                length: tokenText.length,
                                columnIndex: columnIndex,
                            });
                            searchStart = idx + tokenText.length;
                        }

                        if (valueRanges.length > 0) {
                            current.dataRows.push({ line: i, valueRanges });
                            current.processedValueCount += valueRanges.length;
                            current.namesDefined = true;
                        }
                    }
                }
            } else if (current && current.fieldNames.length > 0) {
                // Data line (not a data name)
                if (!current.namesDefined) {
                    current.namesDefined = true;
                }

                const valueRanges: ValueRange[] = [];
                const fieldCount = current.fieldNames.length;
                const maxCols = Math.min(fieldCount, tokens.length);
                let searchStart = 0;

                for (let col = 0; col < maxCols; col++) {
                    const tokenText = tokens[col][0];
                    if (!tokenText) continue;
                    const idx = lineText.indexOf(tokenText, searchStart);
                    if (idx === -1) continue;

                    const currentTotalCount = current.processedValueCount + col;
                    const effectiveColIndex = currentTotalCount % fieldCount;

                    valueRanges.push({
                        start: idx,
                        length: tokenText.length,
                        columnIndex: effectiveColIndex,
                    });
                    searchStart = idx + tokenText.length;
                }

                if (valueRanges.length > 0) {
                    current.dataRows.push({ line: i, valueRanges });
                    current.processedValueCount += valueRanges.length;
                }
            }
        }

        emitCurrent();
        return blocks;
    }

    /**
     * Calculate the current column index for multi-line string coloring.
     */
    private currentColumnIndex(block: ParserBlock): number {
        const fieldCount = block.fieldNames.length || 1;
        return block.processedValueCount % fieldCount;
    }
}
