
import * as vscode from 'vscode';

export interface LoopBlock {
    startLine: number;
    categoryName: string;
    fieldNames: Array<{ line: number; start: number; length: number; fieldName: string }>;
    namesDefined: boolean; // Flag to track if column names are defined
    isInLoopBlock: boolean; // Flag to track if this loop is inside a loop_ block
    processedValueCount: number; // Counter for determining column index in stream
    colorIndex: number; // Color index for single items (based on category item count)
    dataLines: Array<{
        line: number;
        valueRanges: Array<{ start: number; length: number; columnIndex: number }>;
    }>;
}

export class CifParser {
    /**
     * Split a line into tokens, handling quoted strings correctly.
     * Based on CIF parser's specialSplit method.
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

            // Check for quote start/end
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
                output[olast][1] = true; // Mark as quoted
            } else if (!quote && isWS && output[olast][0] !== "") {
                // Whitespace outside quotes - start new token
                output.push(["", false]);
                olast++;
            } else if (!quote && char === "#") {
                // Comment starts - stop processing
                break;
            } else if (!isWS || quote) {
                // Add character to current token
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

    /**
     * Check if a token is a data name (starts with _ and is not quoted)
     */
    public isDataName(token: [string, boolean]): boolean {
        return token[0].startsWith("_") && !token[1]; // starts with _ and not quoted
    }

    /**
     * Check if a token is a loop keyword
     */
    public isLoopKeyword(token: [string, boolean]): boolean {
        return token[0] === "loop_" && !token[1]; // loop_ and not quoted
    }

    /**
     * Check if a token is a data/save/global keyword
     */
    public isBlockKeyword(token: [string, boolean]): boolean {
        if (token[1]) return false; // quoted tokens are not keywords
        const text = token[0];
        return (
            text === "global_" ||
            text.startsWith("data_") ||
            text.startsWith("save_")
        );
    }

    public parseLoops(document: vscode.TextDocument, builder?: vscode.SemanticTokensBuilder): LoopBlock[] {
        const loops: LoopBlock[] = [];
        let currentLoop: LoopBlock | null = null;
        let multiLineMode = false;
        let multiLineBuffer: string[] = [];

        // Track category item counts for color cycling (same logic as tokenProvider)
        const categoryItemCounts = new Map<string, number>();
        let lastCategory = "";

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const lineText = line.text;
            const firstChar = lineText.length > 0 ? lineText[0] : "";

            // Skip comment lines
            if (firstChar === "#") {
                // If we're in a loop and have field names, end the loop
                if (currentLoop && currentLoop.fieldNames.length > 0 && currentLoop.namesDefined) {
                    loops.push(currentLoop);
                    currentLoop = null;
                }
                continue;
            }

            // Handle multi-line strings (; ... ;)
            if (firstChar === ";") {
                if (multiLineMode) {
                    // End of multi-line string
                    multiLineMode = false;
                    // Color the closing semicolon line
                    // Calculate column index for color cycling
                    let tokenTypeIndex = 2; // Default to rainbow3 (string)
                    if (currentLoop) {
                        const fieldCount = currentLoop.fieldNames.length || 1;
                        let colIndex = 0;

                        if (currentLoop.isInLoopBlock) {
                            colIndex = currentLoop.processedValueCount % fieldCount;
                        } else {
                            colIndex = currentLoop.colorIndex;
                        }
                        tokenTypeIndex = 1 + (colIndex % 8);

                        // Register this line in dataLines so it can be highlighted/hovered
                        if (!currentLoop.dataLines) currentLoop.dataLines = [];
                        currentLoop.dataLines.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });

                        // Increment value count because a multi-line string is one value
                        currentLoop.processedValueCount++;
                    }

                    if (builder) builder.push(i, 0, lineText.length, tokenTypeIndex, 0);

                    // Multi-line strings are data values, not column names
                    if (currentLoop && currentLoop.fieldNames.length > 0) {
                        currentLoop.namesDefined = true;
                    }
                    multiLineBuffer = [];
                } else {
                    // Start of multi-line string
                    multiLineMode = true;

                    // Color the opening semicolon line
                    let tokenTypeIndex = 2; // Default
                    if (currentLoop) {
                        const fieldCount = currentLoop.fieldNames.length || 1;
                        let colIndex = 0;
                        if (currentLoop.isInLoopBlock) {
                            colIndex = currentLoop.processedValueCount % fieldCount;
                        } else {
                            colIndex = currentLoop.colorIndex;
                        }
                        tokenTypeIndex = 1 + (colIndex % 8);

                        // Register this line in dataLines
                        if (!currentLoop.dataLines) currentLoop.dataLines = [];
                        currentLoop.dataLines.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });
                    }

                    if (builder) builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                    multiLineBuffer = [];
                }
                continue;
            }

            if (multiLineMode) {
                // We're inside a multi-line string, skip this line
                multiLineBuffer.push(lineText);

                // Always register this line in dataLines so it can be highlighted/hovered
                if (currentLoop) {
                    const fieldCount = currentLoop.fieldNames.length || 1;
                    if (currentLoop.isInLoopBlock) {
                        const colIndex = currentLoop.processedValueCount % fieldCount;
                        // Register this line in dataLines
                        if (!currentLoop.dataLines) currentLoop.dataLines = [];
                        currentLoop.dataLines.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });

                        // Color the content line if builder is present
                        if (builder && lineText.length > 0) {
                            const tokenTypeIndex = 1 + (colIndex % 8);
                            builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                        }
                    } else {
                        // Single item multi-line: use colorIndex for consistent color
                        const colIndex = currentLoop.colorIndex;
                        if (!currentLoop.dataLines) currentLoop.dataLines = [];
                        currentLoop.dataLines.push({
                            line: i,
                            valueRanges: [{ start: 0, length: lineText.length, columnIndex: colIndex }]
                        });

                        if (builder && lineText.length > 0) {
                            const tokenTypeIndex = 1 + (colIndex % 8);
                            builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                        }
                    }
                }
                continue;
            }

            const trimmed = lineText.trim();
            if (trimmed === "") {
                // Empty line - if we have a loop with field names, mark names as defined
                if (currentLoop && currentLoop.fieldNames.length > 0 && !currentLoop.namesDefined) {
                    currentLoop.namesDefined = true;
                }
                continue;
            }

            // Split line into tokens
            const tokens = this.specialSplit(trimmed);

            if (tokens.length === 0) continue;

            // Check for block keywords (data_, save_, global_)
            if (this.isBlockKeyword(tokens[0])) {
                // End current loop if exists
                if (currentLoop && currentLoop.fieldNames.length > 0) {
                    loops.push(currentLoop);
                }
                currentLoop = null;
                continue;
            }

            // Check for loop_ keyword
            if (this.isLoopKeyword(tokens[0])) {
                // End previous loop if exists
                if (currentLoop && currentLoop.fieldNames.length > 0) {
                    loops.push(currentLoop);
                }
                currentLoop = {
                    startLine: i,
                    categoryName: "",
                    fieldNames: [],
                    namesDefined: false,
                    isInLoopBlock: true,
                    processedValueCount: 0,
                    colorIndex: 0,
                    dataLines: []
                };
                continue;
            }

            // Check if this is a data name (column header) - can be inside or outside a loop
            if (tokens.length > 0 && this.isDataName(tokens[0])) {
                const dataName = tokens[0][0];
                const match = dataName.match(/^(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)$/);

                if (match) {
                    const categoryName = match[1];
                    const fieldName = match[2];

                    // Find the position in the original line
                    const categoryMatch = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)/);
                    if (categoryMatch) {
                        const leadingSpaces = categoryMatch[1]?.length || 0;
                        const fieldStart = leadingSpaces + categoryName.length + 1; // +1 for the dot
                        const fieldLength = fieldName.length;

                        // Check if we need to close the previous loop
                        if (currentLoop && currentLoop.namesDefined && currentLoop.fieldNames.length > 0) {
                            if (currentLoop.categoryName !== categoryName ||
                                (currentLoop.categoryName === categoryName && currentLoop.fieldNames.length === 1)) {
                                // Close the previous loop (different category, or same category with single item)
                                loops.push(currentLoop);
                                currentLoop = null;
                            }
                        }

                        // If we don't have a current loop, create one for this data name
                        if (!currentLoop) {
                            // Calculate colorIndex for this category item
                            let colorIndex = 0;
                            if (categoryName === lastCategory) {
                                colorIndex = (categoryItemCounts.get(categoryName) || 0) + 1;
                            } else {
                                colorIndex = 0;
                            }
                            categoryItemCounts.set(categoryName, colorIndex);
                            lastCategory = categoryName;

                            // Single items outside loop_ are immediately defined
                            currentLoop = {
                                startLine: i,
                                categoryName: categoryName,
                                fieldNames: [],
                                namesDefined: true,
                                isInLoopBlock: false,
                                processedValueCount: 0,
                                colorIndex: colorIndex,
                                dataLines: []
                            };
                        }

                        if (!currentLoop.categoryName) {
                            currentLoop.categoryName = categoryName;
                        }

                        // Check if this is a new category (different from current loop's category)
                        if (currentLoop.categoryName !== categoryName) {
                            // End current loop and start a new one
                            if (currentLoop.fieldNames.length > 0) {
                                loops.push(currentLoop);
                            }
                            // Calculate colorIndex for new category
                            let colorIndex = 0;
                            if (categoryName === lastCategory) {
                                colorIndex = (categoryItemCounts.get(categoryName) || 0) + 1;
                            } else {
                                colorIndex = 0;
                            }
                            categoryItemCounts.set(categoryName, colorIndex);
                            lastCategory = categoryName;

                            currentLoop = {
                                startLine: i,
                                categoryName: categoryName,
                                fieldNames: [],
                                namesDefined: currentLoop.isInLoopBlock ? false : true,
                                isInLoopBlock: currentLoop.isInLoopBlock,
                                processedValueCount: 0,
                                colorIndex: colorIndex,
                                dataLines: []
                            };
                        }

                        currentLoop.fieldNames.push({
                            line: i,
                            start: fieldStart,
                            length: fieldLength,
                            fieldName: fieldName
                        });

                        // If values exist on the same line (single-item outside loop_), record them as data
                        const valueRanges: Array<{ start: number; length: number; columnIndex: number }> = [];
                        const headerCount = currentLoop.fieldNames.length;
                        const maxCols = Math.min(headerCount, tokens.length - 1);
                        let searchStart = categoryMatch.index! + categoryMatch[0].length;
                        const fieldCount = currentLoop.fieldNames.length;

                        for (let col = 0; col < maxCols; col++) {
                            const tokenText = tokens[col + 1][0];
                            if (!tokenText) {
                                continue;
                            }
                            const idx = lineText.indexOf(tokenText, searchStart);
                            if (idx === -1) {
                                continue;
                            }

                            const columnIndex = headerCount - 1; // current field column index
                            valueRanges.push({ start: idx, length: tokenText.length, columnIndex });
                            searchStart = idx + tokenText.length;
                        }
                        if (valueRanges.length > 0) {
                            currentLoop.dataLines.push({
                                line: i,
                                valueRanges
                            });
                            currentLoop.processedValueCount += valueRanges.length;
                        }
                    }
                }
            } else if (currentLoop) {
                // This is not a data name, but we have a current loop
                if (currentLoop.fieldNames.length > 0) {
                    // This is a data line (not a column header)
                    // Mark that column names are defined
                    if (!currentLoop.namesDefined) {
                        currentLoop.namesDefined = true;
                    }

                    // Collect value ranges for this data line so we can color them later
                    const valueRanges: Array<{ start: number; length: number; columnIndex: number }> = [];
                    const headerCount = currentLoop.fieldNames.length;
                    const maxCols = Math.min(headerCount, tokens.length);
                    let searchStart = 0;

                    for (let col = 0; col < maxCols; col++) {
                        const tokenText = tokens[col][0];
                        if (!tokenText) {
                            continue;
                        }
                        const idx = lineText.indexOf(tokenText, searchStart);
                        if (idx === -1) {
                            continue;
                        }

                        // Calculate column index based on total processed values
                        const fieldCount = currentLoop.fieldNames.length || 1;
                        const currentTotalCount = currentLoop.processedValueCount + col;
                        const effectiveColIndex = currentTotalCount % fieldCount;

                        valueRanges.push({ start: idx, length: tokenText.length, columnIndex: effectiveColIndex });
                        searchStart = idx + tokenText.length;
                    }

                    if (!currentLoop.dataLines) {
                        currentLoop.dataLines = [];
                    }

                    if (valueRanges.length > 0) {
                        currentLoop.dataLines.push({
                            line: i,
                            valueRanges
                        });
                        currentLoop.processedValueCount += valueRanges.length;
                    }
                }
            }
        }

        // Add final loop if exists
        if (currentLoop && currentLoop.fieldNames.length > 0) {
            loops.push(currentLoop);
        }

        return loops;
    }
}
