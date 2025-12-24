"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const rainbowTokenTypes = [
    "rainbow1", // category name
    "rainbow2", // field name 1
    "rainbow3", // field name 2
    "rainbow4", // field name 3
    "rainbow5", // field name 4
    "rainbow6", // field name 5
    "rainbow7", // field name 6
    "rainbow8", // field name 7
    "rainbow9", // field name 8
    "rainbow10" // field name 9
];
const tokensLegend = new vscode.SemanticTokensLegend(rainbowTokenTypes, []);
class MmCifTokenProvider {
    provideDocumentSemanticTokens(document) {
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);
        const loops = this.parseLoops(document, builder);
        let categoryItemCount = 0;
        let lastCategory = "";
        for (const loop of loops) {
            // Determine color index base for this loop/item
            let colorBaseIndex = 0;
            if (loop.isInLoopBlock) {
                // Loop blocks handle their own internal rotation
                // We can reset the single-item counter here if we want, or just ignore it
                lastCategory = ""; // Reset category tracking when hitting a loop block
            }
            else {
                // Single Item
                if (loop.categoryName !== lastCategory) {
                    categoryItemCount = 0;
                    lastCategory = loop.categoryName;
                }
                else {
                    categoryItemCount++;
                }
                colorBaseIndex = categoryItemCount;
            }
            // Color each field name line
            for (let fieldIndex = 0; fieldIndex < loop.fieldNames.length; fieldIndex++) {
                const field = loop.fieldNames[fieldIndex];
                const lineText = document.lineAt(field.line).text;
                const match = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)(\s|$)/);
                if (match) {
                    const leadingSpaces = match[1]?.length || 0;
                    const categoryName = match[2];
                    const fieldName = match[3];
                    // Color category name (rainbow1) - includes the dot
                    const categoryStart = leadingSpaces;
                    const categoryLength = categoryName.length + 1; // +1 for the dot
                    builder.push(field.line, categoryStart, categoryLength, 0, 0); // rainbow1
                    // Color field name (rainbow2-rainbow10, cycling)
                    const fieldStart = leadingSpaces + categoryName.length + 1; // +1 for the dot
                    const fieldLength = fieldName.length;
                    let tokenTypeIndex;
                    if (loop.isInLoopBlock) {
                        // Inside loop_ block: use field index within the loop
                        tokenTypeIndex = 1 + (fieldIndex % 8); // rainbow2-rainbow9
                    }
                    else {
                        // Outside loop_ block: use the category counter
                        tokenTypeIndex = 1 + (colorBaseIndex % 8);
                    }
                    builder.push(field.line, fieldStart, fieldLength, tokenTypeIndex, 0);
                }
            }
            // Color data lines: values in each column get the same color as the corresponding header field
            for (const dataLine of loop.dataLines || []) {
                const maxCols = Math.min(loop.fieldNames.length, dataLine.valueRanges.length);
                for (let col = 0; col < maxCols; col++) {
                    const valueRange = dataLine.valueRanges[col];
                    const colIndex = valueRange.columnIndex ?? col;
                    let tokenTypeIndex;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % 8); // same rule as header fields: rainbow2-rainbow9
                    }
                    else {
                        // For single items, use the same color as the key (header)
                        // This ensures Key and Value are visually paired
                        tokenTypeIndex = 1 + (colorBaseIndex % 8);
                    }
                    builder.push(dataLine.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                }
            }
        }
        return builder.build();
    }
    /**
     * Split a line into tokens, handling quoted strings correctly.
     * Based on CIF parser's specialSplit method.
     */
    specialSplit(content) {
        const output = [["", false]];
        let quote = false;
        let qtype = null;
        const length = content.length;
        let olast = 0;
        for (let i = 0; i < length; i++) {
            const isWS = content[i] === " " || content[i] === "\t";
            const char = content[i];
            // Check for quote start/end
            if ((char === "'" || char === '"') &&
                (i === 0 ||
                    content[i - 1] === " " ||
                    content[i - 1] === "\t" ||
                    i === length - 1 ||
                    content[i + 1] === " " ||
                    content[i + 1] === "\t") &&
                (!quote || char === qtype)) {
                quote = !quote;
                qtype = quote ? char : null;
                output[olast][0] += char;
                output[olast][1] = true; // Mark as quoted
            }
            else if (!quote && isWS && output[olast][0] !== "") {
                // Whitespace outside quotes - start new token
                output.push(["", false]);
                olast++;
            }
            else if (!quote && char === "#") {
                // Comment starts - stop processing
                break;
            }
            else if (!isWS || quote) {
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
    isDataName(token) {
        return token[0].startsWith("_") && !token[1]; // starts with _ and not quoted
    }
    /**
     * Check if a token is a loop keyword
     */
    isLoopKeyword(token) {
        return token[0] === "loop_" && !token[1]; // loop_ and not quoted
    }
    /**
     * Check if a token is a data/save/global keyword
     */
    isBlockKeyword(token) {
        if (token[1])
            return false; // quoted tokens are not keywords
        const text = token[0];
        return (text === "global_" ||
            text.startsWith("data_") ||
            text.startsWith("save_"));
    }
    parseLoops(document, builder) {
        const loops = [];
        let currentLoop = null;
        let multiLineMode = false;
        let multiLineBuffer = [];
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
                        if (currentLoop.isInLoopBlock) {
                            const colIndex = currentLoop.processedValueCount % fieldCount;
                            tokenTypeIndex = 1 + (colIndex % 8); // rainbow2-rainbow9
                        }
                        else {
                            tokenTypeIndex = 2; // Single item value is always rainbow3
                        }
                        // Increment value count because a multi-line string is one value
                        currentLoop.processedValueCount++;
                    }
                    if (builder)
                        builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                    // Multi-line strings are data values, not column names
                    if (currentLoop && currentLoop.fieldNames.length > 0) {
                        currentLoop.namesDefined = true;
                    }
                    multiLineBuffer = [];
                }
                else {
                    // Start of multi-line string
                    multiLineMode = true;
                    // Color the opening semicolon line
                    let tokenTypeIndex = 2; // Default
                    if (currentLoop) {
                        const fieldCount = currentLoop.fieldNames.length || 1;
                        if (currentLoop.isInLoopBlock) {
                            const colIndex = currentLoop.processedValueCount % fieldCount;
                            tokenTypeIndex = 1 + (colIndex % 8);
                        }
                        else {
                            tokenTypeIndex = 2;
                        }
                    }
                    if (builder)
                        builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
                    multiLineBuffer = [];
                }
                continue;
            }
            if (multiLineMode) {
                // We're inside a multi-line string, skip this line
                multiLineBuffer.push(lineText);
                // Color the content line
                if (builder && lineText.length > 0) {
                    let tokenTypeIndex = 2;
                    if (currentLoop) {
                        const fieldCount = currentLoop.fieldNames.length || 1;
                        if (currentLoop.isInLoopBlock) {
                            const colIndex = currentLoop.processedValueCount % fieldCount;
                            tokenTypeIndex = 1 + (colIndex % 8);
                        }
                    }
                    builder.push(i, 0, lineText.length, tokenTypeIndex, 0);
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
            if (tokens.length === 0)
                continue;
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
                            // Single items outside loop_ are immediately defined
                            currentLoop = {
                                startLine: i,
                                categoryName: categoryName,
                                fieldNames: [],
                                namesDefined: true, // Single items outside loop_ are immediately defined
                                isInLoopBlock: false,
                                processedValueCount: 0,
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
                            currentLoop = {
                                startLine: i,
                                categoryName: categoryName,
                                fieldNames: [],
                                namesDefined: currentLoop.isInLoopBlock ? false : true, // Preserve loop block status
                                isInLoopBlock: currentLoop.isInLoopBlock,
                                processedValueCount: 0,
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
                        const valueRanges = [];
                        const headerCount = currentLoop.fieldNames.length;
                        const maxCols = Math.min(headerCount, tokens.length - 1);
                        let searchStart = categoryMatch.index + categoryMatch[0].length;
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
            }
            else if (currentLoop) {
                // This is not a data name, but we have a current loop
                if (currentLoop.fieldNames.length > 0) {
                    // This is a data line (not a column header)
                    // Mark that column names are defined
                    if (!currentLoop.namesDefined) {
                        currentLoop.namesDefined = true;
                    }
                    // Collect value ranges for this data line so we can color them later
                    const valueRanges = [];
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
function activate(context) {
    const provider = new MmCifTokenProvider();
    const selector = {
        language: "mmcif",
        scheme: "file"
    };
    const disposable = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, tokensLegend);
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map