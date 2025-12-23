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
let debugOutputChannel = null;
let statusBarItem = null;
class MmCifTokenProvider {
    constructor(debugOutputChannel) {
        this.debugOutputChannel = null;
        this.debugOutputChannel = debugOutputChannel || null;
    }
    debugLog(message) {
        if (this.debugOutputChannel) {
            this.debugOutputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
        }
    }
    provideDocumentSemanticTokens(document) {
        this.debugLog(`Parsing document: ${document.fileName}`);
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);
        const loops = this.parseLoops(document);
        this.debugLog(`Found ${loops.length} loop(s)`);
        let totalTokens = 0;
        for (const loop of loops) {
            this.debugLog(`Loop at line ${loop.startLine + 1}: ${loop.categoryName} with ${loop.fieldNames.length} fields (inLoopBlock: ${loop.isInLoopBlock})`);
            // Color each field name line
            for (let fieldIndex = 0; fieldIndex < loop.fieldNames.length; fieldIndex++) {
                const field = loop.fieldNames[fieldIndex];
                const lineText = document.lineAt(field.line).text;
                const match = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_]+)(\s|$)/);
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
                        tokenTypeIndex = 1 + (fieldIndex % 9); // rainbow2-rainbow10
                    }
                    else {
                        // Outside loop_ block (single-item lines): always use first field color
                        tokenTypeIndex = 1; // rainbow2
                    }
                    builder.push(field.line, fieldStart, fieldLength, tokenTypeIndex, 0);
                    totalTokens += 2;
                    this.debugLog(`  Header field ${fieldIndex + 1}: ${fieldName} (line ${field.line + 1}, token type: rainbow${tokenTypeIndex + 1}, isInLoopBlock: ${loop.isInLoopBlock})`);
                }
            }
            // Color data lines: values in each column get the same color as the corresponding header field
            for (const dataLine of loop.dataLines || []) {
                const maxCols = Math.min(loop.fieldNames.length, dataLine.valueRanges.length);
                for (let col = 0; col < maxCols; col++) {
                    const valueRange = dataLine.valueRanges[col];
                    const colIndex = valueRange.columnIndex ?? col;
                    const tokenTypeIndex = 1 + (colIndex % 9); // same rule as header fields: rainbow2-rainbow10
                    builder.push(dataLine.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                    totalTokens += 1;
                }
            }
        }
        this.debugLog(`Total tokens created: ${totalTokens}`);
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
                output[olast][1] = quote;
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
    parseLoops(document) {
        this.debugLog("Starting parseLoops");
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
                    this.debugLog(`Ending loop at line ${i + 1} (comment)`);
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
                    this.debugLog(`Ended multi-line string at line ${i + 1}`);
                    // Multi-line strings are data values, not column names
                    if (currentLoop && currentLoop.fieldNames.length > 0) {
                        currentLoop.namesDefined = true;
                    }
                    multiLineBuffer = [];
                }
                else {
                    // Start of multi-line string
                    multiLineMode = true;
                    this.debugLog(`Started multi-line string at line ${i + 1}`);
                    multiLineBuffer = [];
                }
                continue;
            }
            if (multiLineMode) {
                // We're inside a multi-line string, skip this line
                multiLineBuffer.push(lineText);
                continue;
            }
            const trimmed = lineText.trim();
            if (trimmed === "") {
                // Empty line - if we have a loop with field names, mark names as defined
                if (currentLoop && currentLoop.fieldNames.length > 0 && !currentLoop.namesDefined) {
                    currentLoop.namesDefined = true;
                    this.debugLog(`Marked names as defined at line ${i + 1} (empty line)`);
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
                    this.debugLog(`Ending loop at line ${i + 1} (block keyword: ${tokens[0][0]})`);
                    loops.push(currentLoop);
                }
                currentLoop = null;
                continue;
            }
            // Check for loop_ keyword
            if (this.isLoopKeyword(tokens[0])) {
                // End previous loop if exists
                if (currentLoop && currentLoop.fieldNames.length > 0) {
                    this.debugLog(`Ending previous loop at line ${i + 1}`);
                    loops.push(currentLoop);
                }
                currentLoop = {
                    startLine: i,
                    categoryName: "",
                    fieldNames: [],
                    namesDefined: false,
                    isInLoopBlock: true,
                    dataLines: []
                };
                this.debugLog(`Started new loop at line ${i + 1}`);
                continue;
            }
            // Check if this is a data name (column header) - can be inside or outside a loop
            if (tokens.length > 0 && this.isDataName(tokens[0])) {
                const dataName = tokens[0][0];
                const match = dataName.match(/^(_[A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
                if (match) {
                    const categoryName = match[1];
                    const fieldName = match[2];
                    // Find the position in the original line
                    const categoryMatch = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/);
                    if (categoryMatch) {
                        const leadingSpaces = categoryMatch[1]?.length || 0;
                        const fieldStart = leadingSpaces + categoryName.length + 1; // +1 for the dot
                        const fieldLength = fieldName.length;
                        // Check if we need to close the previous loop
                        // Close if:
                        // 1. We have a current loop with names defined (single item or completed loop)
                        // 2. AND (it's a different category OR it's the same category but we already have a field)
                        if (currentLoop && currentLoop.namesDefined && currentLoop.fieldNames.length > 0) {
                            if (currentLoop.categoryName !== categoryName ||
                                (currentLoop.categoryName === categoryName && currentLoop.fieldNames.length === 1)) {
                                // Close the previous loop (different category, or same category with single item)
                                this.debugLog(`Ending loop at line ${i + 1} (new data name)`);
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
                                dataLines: []
                            };
                            this.debugLog(`Started new loop (single item) at line ${i + 1}: ${categoryName}`);
                        }
                        if (!currentLoop.categoryName) {
                            currentLoop.categoryName = categoryName;
                            this.debugLog(`  Category: ${categoryName}`);
                        }
                        // Check if this is a new category (different from current loop's category)
                        if (currentLoop.categoryName !== categoryName) {
                            // End current loop and start a new one
                            if (currentLoop.fieldNames.length > 0) {
                                this.debugLog(`Ending loop at line ${i + 1} (new category)`);
                                loops.push(currentLoop);
                            }
                            currentLoop = {
                                startLine: i,
                                categoryName: categoryName,
                                fieldNames: [],
                                namesDefined: currentLoop.isInLoopBlock ? false : true, // Preserve loop block status
                                isInLoopBlock: currentLoop.isInLoopBlock,
                                dataLines: []
                            };
                            this.debugLog(`Started new loop (category change) at line ${i + 1}: ${categoryName}`);
                        }
                        currentLoop.fieldNames.push({
                            line: i,
                            start: fieldStart,
                            length: fieldLength,
                            fieldName: fieldName
                        });
                        this.debugLog(`  Added field: ${fieldName} (line ${i + 1})`);
                        // If values exist on the same line (single-item outside loop_), record them as data
                        const valueRanges = [];
                        const headerCount = currentLoop.fieldNames.length;
                        const maxCols = Math.min(headerCount, tokens.length - 1);
                        let searchStart = categoryMatch.index + categoryMatch[0].length;
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
                            this.debugLog(`  Added inline data values at line ${i + 1} (${valueRanges.length} value(s))`);
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
                        this.debugLog(`Marked names as defined at line ${i + 1} (data line)`);
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
                        valueRanges.push({ start: idx, length: tokenText.length, columnIndex: col });
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
                        this.debugLog(`  Added data line at ${i + 1} with ${valueRanges.length} value(s)`);
                    }
                }
            }
        }
        // Add final loop if exists
        if (currentLoop && currentLoop.fieldNames.length > 0) {
            this.debugLog(`Ending final loop`);
            loops.push(currentLoop);
        }
        this.debugLog(`parseLoops completed: ${loops.length} loop(s) found`);
        return loops;
    }
}
function activate(context) {
    // Create output channel for debugging
    debugOutputChannel = vscode.window.createOutputChannel("mmCIF Rainbow Debug");
    context.subscriptions.push(debugOutputChannel);
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "mmcif-rainbow.showDebugInfo";
    statusBarItem.tooltip = "Show mmCIF Rainbow debug information";
    context.subscriptions.push(statusBarItem);
    const provider = new MmCifTokenProvider(debugOutputChannel);
    const selector = {
        language: "mmcif",
        scheme: "file"
    };
    const disposable = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, tokensLegend);
    context.subscriptions.push(disposable);
    // Register debug command
    const debugCommand = vscode.commands.registerCommand("mmcif-rainbow.showDebugInfo", () => {
        if (debugOutputChannel) {
            debugOutputChannel.show();
        }
    });
    context.subscriptions.push(debugCommand);
    // Register command to show parse results
    const parseCommand = vscode.commands.registerCommand("mmcif-rainbow.debugParse", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "mmcif") {
            vscode.window.showWarningMessage("Please open an mmCIF file first");
            return;
        }
        const provider = new MmCifTokenProvider(debugOutputChannel || undefined);
        const loops = provider.parseLoops(editor.document);
        if (debugOutputChannel) {
            debugOutputChannel.clear();
            debugOutputChannel.appendLine("=== mmCIF Parse Results ===");
            debugOutputChannel.appendLine(`File: ${editor.document.fileName}`);
            debugOutputChannel.appendLine(`Total loops: ${loops.length}\n`);
            loops.forEach((loop, index) => {
                debugOutputChannel.appendLine(`Loop ${index + 1}:`);
                debugOutputChannel.appendLine(`  Start line: ${loop.startLine + 1}`);
                debugOutputChannel.appendLine(`  Category: ${loop.categoryName}`);
                debugOutputChannel.appendLine(`  Fields: ${loop.fieldNames.length}`);
                debugOutputChannel.appendLine(`  Names defined: ${loop.namesDefined}`);
                loop.fieldNames.forEach((field, fieldIndex) => {
                    debugOutputChannel.appendLine(`    ${fieldIndex + 1}. ${field.fieldName} (line ${field.line + 1}, start: ${field.start}, length: ${field.length})`);
                });
                debugOutputChannel.appendLine("");
            });
            debugOutputChannel.show();
        }
    });
    context.subscriptions.push(parseCommand);
    // Register command to debug token colors at cursor position
    const debugColorCommand = vscode.commands.registerCommand("mmcif-rainbow.debugColor", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "mmcif") {
            vscode.window.showWarningMessage("Please open an mmCIF file first");
            return;
        }
        const position = editor.selection.active;
        const document = editor.document;
        if (debugOutputChannel) {
            debugOutputChannel.clear();
            debugOutputChannel.appendLine("=== Token Color Debug ===");
            debugOutputChannel.appendLine(`Position: Line ${position.line + 1}, Column ${position.character + 1}`);
            debugOutputChannel.appendLine(`Character: "${document.getText(new vscode.Range(position, position.translate(0, 1)))}"`);
            debugOutputChannel.appendLine("");
            // Get semantic tokens
            const provider = new MmCifTokenProvider();
            const semanticTokens = await provider.provideDocumentSemanticTokens(document);
            if (semanticTokens) {
                debugOutputChannel.appendLine("=== Semantic Tokens ===");
                const data = semanticTokens.data;
                let currentLine = 0;
                let currentChar = 0;
                for (let i = 0; i < data.length; i += 5) {
                    const deltaLine = data[i];
                    const deltaChar = data[i + 1];
                    const length = data[i + 2];
                    const tokenType = data[i + 3];
                    const tokenModifiers = data[i + 4];
                    currentLine += deltaLine;
                    if (deltaLine === 0) {
                        currentChar += deltaChar;
                    }
                    else {
                        currentChar = deltaChar;
                    }
                    const tokenStart = new vscode.Position(currentLine, currentChar);
                    const tokenEnd = new vscode.Position(currentLine, currentChar + length);
                    const tokenRange = new vscode.Range(tokenStart, tokenEnd);
                    if (tokenRange.contains(position)) {
                        const tokenText = document.getText(tokenRange);
                        const tokenTypeName = rainbowTokenTypes[tokenType] || `unknown(${tokenType})`;
                        debugOutputChannel.appendLine(`Token found at cursor:`);
                        debugOutputChannel.appendLine(`  Text: "${tokenText}"`);
                        debugOutputChannel.appendLine(`  Type: ${tokenTypeName}`);
                        debugOutputChannel.appendLine(`  Type Index: ${tokenType}`);
                        debugOutputChannel.appendLine(`  Range: Line ${currentLine + 1}, Col ${currentChar + 1}-${currentChar + length + 1}`);
                        debugOutputChannel.appendLine(`  Modifiers: ${tokenModifiers}`);
                        // Check configuration
                        const config = vscode.workspace.getConfiguration("editor", {
                            languageId: "mmcif"
                        });
                        const semanticHighlighting = config.get("semanticHighlighting.enabled");
                        debugOutputChannel.appendLine(`  Semantic Highlighting Enabled: ${semanticHighlighting}`);
                        const colorCustomizations = config.get("semanticTokenColorCustomizations");
                        if (colorCustomizations && colorCustomizations.rules) {
                            const rule = colorCustomizations.rules[tokenTypeName];
                            if (rule) {
                                debugOutputChannel.appendLine(`  Color Rule: ${JSON.stringify(rule)}`);
                            }
                            else {
                                debugOutputChannel.appendLine(`  Color Rule: NOT FOUND for ${tokenTypeName}`);
                            }
                        }
                    }
                }
            }
            // Check TextMate scopes (use `any` because this is an internal/dev command)
            debugOutputChannel.appendLine("");
            debugOutputChannel.appendLine("=== TextMate Scopes ===");
            const textMateScopes = await vscode.commands.executeCommand("vscode.executeTextMateScopes", document.uri, position);
            if (textMateScopes && Array.isArray(textMateScopes.scopes)) {
                debugOutputChannel.appendLine(`Scopes: ${textMateScopes.scopes.join(", ")}`);
            }
            debugOutputChannel.show();
        }
    });
    context.subscriptions.push(debugColorCommand);
    // Update status bar when document changes
    const updateStatusBar = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === "mmcif" && statusBarItem) {
            const provider = new MmCifTokenProvider();
            const loops = provider.parseLoops(editor.document);
            statusBarItem.text = `$(symbol-class) ${loops.length} loop(s)`;
            statusBarItem.show();
        }
        else if (statusBarItem) {
            statusBarItem.hide();
        }
    };
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar);
    vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && e.document === editor.document) {
            updateStatusBar();
        }
    });
    updateStatusBar();
}
function deactivate() {
    if (debugOutputChannel) {
        debugOutputChannel.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
//# sourceMappingURL=extension.js.map