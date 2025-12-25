import * as vscode from 'vscode';
import * as path from 'path';

// Interface for the WASM module
interface VectorInt {
    get(index: number): number;
    size(): number;
    delete(): void;
}

interface CifTokenizerModule {
    tokenize(input: string): VectorInt;
}

// Emscripten module factory type
type CifTokenizerFactory = (options?: any) => Promise<CifTokenizerModule>;

let wasmModule: CifTokenizerModule | null = null;
let factoryLoadingPromise: Promise<CifTokenizerModule> | null = null;

export async function loadWasmModule(context: vscode.ExtensionContext): Promise<void> {
    if (wasmModule) return;
    if (factoryLoadingPromise) {
        await factoryLoadingPromise;
        return;
    }

    try {
        // The tokenizer.js is expected to be in the dist folder alongside extension.js
        const wasmPath = path.join(context.extensionPath, 'dist', 'tokenizer.js');
        const tokenizerFactory = require(wasmPath) as CifTokenizerFactory;

        factoryLoadingPromise = tokenizerFactory({
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) {
                    return context.asAbsolutePath('dist/' + path);
                }
                return path;
            }
        });

        wasmModule = await factoryLoadingPromise;
        console.log('MMCIF: WASM module loaded successfully');
    } catch (e) {
        console.error('MMCIF: Failed to load WASM module', e);
        throw e;
    }
}

export interface LoopBlock {
    startLine: number;
    categoryName: string;
    fieldNames: Array<{ line: number; start: number; length: number; fieldName: string }>;
    namesDefined: boolean;
    isInLoopBlock: boolean;
    processedValueCount: number;
    dataLines: Array<{
        line: number;
        valueRanges: Array<{ start: number; length: number; columnIndex: number }>;
    }>;
}

export class WasmCifParser {

    constructor() { }

    public parseLoops(document: vscode.TextDocument, builder?: vscode.SemanticTokensBuilder, range?: vscode.Range): LoopBlock[] {
        if (!wasmModule) {
            console.error('MMCIF: WASM module not loaded');
            return [];
        }

        const text = document.getText();
        // If range is provided, we technically only need to color that range.
        // However, we need to parse from the start to know the state (Loop context).
        // Optimally we could start parsing from a known safe point, but for now we parse all and filter output.

        let tokens: VectorInt;

        try {
            tokens = wasmModule.tokenize(text);
        } catch (e) {
            console.error('MMCIF: Tokenization failed', e);
            return [];
        }

        const size = tokens.size();
        let i = 0;

        const loops: LoopBlock[] = [];
        let currentLoop: LoopBlock | null = null;

        // Coloring state for single items
        let lastCategory = "";
        let categoryItemCount = 0;

        // Position tracking
        let currentIdx = 0;
        let currentLine = 0;
        let currentChar = 0;

        // Memory optimization: For files > 50MB, skip storing loop structures (disables hover/cursor highlight)
        // USER REQUEST: Enable hover for files up to 50MB.
        const isLargeFile = text.length > 50 * 1024 * 1024;

        // Massive file optimization: For files > 50MB, skip Highlighting values entirely to prevent OOM/Freeze.
        // We still highlight Keywords, Tags, and Categories to give structure.
        const isMassiveFile = text.length > 50 * 1024 * 1024;

        if (isLargeFile) {
            console.warn(`MMCIF: Large file detected (${(text.length / 1024 / 1024).toFixed(1)}MB). Low-memory mode enabled.`);
        }
        if (isMassiveFile) {
            console.warn(`MMCIF: Massive file detected. Skipping value highlighting to ensure stability.`);
        }

        while (i < size) {
            const startStrIndex = tokens.get(i++);
            const length = tokens.get(i++);
            const type = tokens.get(i++);

            // Advance position to startStrIndex
            while (currentIdx < startStrIndex) {
                const newlineIdx = text.indexOf('\n', currentIdx);
                if (newlineIdx === -1 || newlineIdx >= startStrIndex) {
                    // No more newlines before target, or at all
                    currentChar += (startStrIndex - currentIdx);
                    currentIdx = startStrIndex;
                    break;
                }
                // Found a newline
                currentLine++;
                currentChar = 0;
                currentIdx = newlineIdx + 1;
            }

            const startPosLine = currentLine;
            const startPosCharacter = currentChar;

            // Range Check Helper (inlined for performance)
            // If range is defined, only push if startPosLine is within range.
            // Note: For multiline tokens (Type 3), we'll check individual lines.
            const inRange = !range || (startPosLine >= range.start.line && startPosLine <= range.end.line);

            if (type === 1) { // Keyword
                const keyword = text.substr(startStrIndex, length);

                if (keyword.startsWith('loop_')) {
                    if (currentLoop && currentLoop.fieldNames.length > 0 && !isLargeFile) loops.push(currentLoop);
                    currentLoop = {
                        startLine: startPosLine,
                        categoryName: "",
                        fieldNames: [],
                        namesDefined: false,
                        isInLoopBlock: true,
                        processedValueCount: 0,
                        dataLines: []
                    };
                    // Reset category tracking for single items when entering a loop
                    lastCategory = "";
                } else if (keyword.startsWith('data_') || keyword.startsWith('save_') || keyword.startsWith('global_') || keyword.startsWith('stop_')) {
                    if (currentLoop && currentLoop.fieldNames.length > 0 && !isLargeFile) loops.push(currentLoop);
                    currentLoop = null;
                    lastCategory = "";
                }

                if (builder && inRange) builder.push(startPosLine, startPosCharacter, length, 1, 0);

            } else if (type === 2) { // Tag
                const tagFull = text.substr(startStrIndex, length);
                let categoryName = "";
                let fieldName = tagFull;
                const dotIndex = tagFull.indexOf('.');
                if (dotIndex !== -1) {
                    categoryName = tagFull.substring(0, dotIndex);
                    fieldName = tagFull.substring(dotIndex + 1);
                } else {
                    categoryName = tagFull;
                }

                // Decide whether to append to current loop or start new one
                let appendToCurrent = false;

                if (currentLoop && currentLoop.isInLoopBlock && !currentLoop.namesDefined) {
                    appendToCurrent = true;
                }

                if (appendToCurrent && currentLoop) {
                    if (!currentLoop.categoryName) currentLoop.categoryName = categoryName;
                    currentLoop.fieldNames.push({
                        line: startPosLine,
                        start: startPosCharacter,
                        length: length,
                        fieldName: fieldName
                    });

                    // Coloring for Loop Header
                    if (builder && inRange) {
                        if (dotIndex !== -1) {
                            builder.push(startPosLine, startPosCharacter, categoryName.length + 1, 0, 0); // category -> rainbow1

                            const fieldIndex = currentLoop.fieldNames.length - 1;
                            const tokenTypeIndex = 1 + (fieldIndex % 8);
                            builder.push(startPosLine, startPosCharacter + categoryName.length + 1, fieldName.length, tokenTypeIndex, 0);
                        } else {
                            builder.push(startPosLine, startPosCharacter, length, 0, 0);
                        }
                    }

                } else {
                    // Start new single item loop
                    if (currentLoop && currentLoop.fieldNames.length > 0 && !isLargeFile) {
                        loops.push(currentLoop);
                    }

                    // Track category for coloring (Correct Logic)
                    if (categoryName !== lastCategory) {
                        categoryItemCount = 0;
                        lastCategory = categoryName;
                    } else {
                        categoryItemCount++;
                    }

                    currentLoop = {
                        startLine: startPosLine,
                        categoryName: categoryName,
                        fieldNames: [{
                            line: startPosLine,
                            start: startPosCharacter,
                            length: length,
                            fieldName: fieldName
                        }],
                        namesDefined: true, // Single item implies name is defined immediately
                        isInLoopBlock: false,
                        processedValueCount: 0,
                        dataLines: []
                    };

                    // Coloring for Single Item Header
                    if (builder && inRange) {
                        if (dotIndex !== -1) {
                            builder.push(startPosLine, startPosCharacter, categoryName.length + 1, 0, 0); // category -> rainbow1

                            // Use categoryItemCount for color rotation
                            const tokenTypeIndex = 1 + (categoryItemCount % 8);
                            builder.push(startPosLine, startPosCharacter + categoryName.length + 1, fieldName.length, tokenTypeIndex, 0);
                        } else {
                            builder.push(startPosLine, startPosCharacter, length, 0, 0);
                        }
                    }
                }

            } else if (type === 5) { // Simple Value (simunq)
                // Guaranteed single line, no quotes.
                if (currentLoop) {
                    if (currentLoop.isInLoopBlock && !currentLoop.namesDefined) {
                        currentLoop.namesDefined = true;
                    }

                    const fieldCount = currentLoop.fieldNames.length || 1;
                    const colIndex = currentLoop.processedValueCount % fieldCount;

                    let tokenTypeIndex = 0;
                    if (currentLoop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % 8);
                    } else {
                        tokenTypeIndex = 1 + (categoryItemCount % 8);
                    }

                    // Optimization: No text extraction, no splitting.
                    // Just register position.

                    // Register in dataLines (SKIP if Large File)
                    if (!isLargeFile) {
                        let lastDataLine = currentLoop.dataLines[currentLoop.dataLines.length - 1];
                        if (!lastDataLine || lastDataLine.line !== startPosLine) {
                            lastDataLine = { line: startPosLine, valueRanges: [] };
                            currentLoop.dataLines.push(lastDataLine);
                        }
                        lastDataLine.valueRanges.push({
                            start: startPosCharacter,
                            length: length,
                            columnIndex: colIndex
                        });
                    }

                    if (builder && !isMassiveFile && inRange) {
                        builder.push(startPosLine, startPosCharacter, length, tokenTypeIndex, 0);
                    }

                    currentLoop.processedValueCount++;
                }

            } else if (type === 3) { // Complex Value (quoted, textfield)
                if (currentLoop) {
                    // If we are in a loop block, mark names as defined (if not already)
                    if (currentLoop.isInLoopBlock && !currentLoop.namesDefined) {
                        currentLoop.namesDefined = true;
                    }

                    const fieldCount = currentLoop.fieldNames.length || 1;
                    const colIndex = currentLoop.processedValueCount % fieldCount;

                    let tokenTypeIndex = 0;
                    if (currentLoop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % 8);
                    } else {
                        // Single item value: matches the single item field color
                        tokenTypeIndex = 1 + (categoryItemCount % 8);
                    }

                    const tokenText = text.substr(startStrIndex, length);
                    const lines = tokenText.split(/\r\n|\r|\n/);

                    let valueLine = startPosLine;
                    let valueChar = startPosCharacter;

                    for (let j = 0; j < lines.length; j++) {
                        const lineContent = lines[j];

                        // Register in dataLines for Hover/Cursor (SKIP if Large File)
                        if (!isLargeFile) {
                            let lastDataLine = currentLoop.dataLines[currentLoop.dataLines.length - 1];
                            if (!lastDataLine || lastDataLine.line !== valueLine) {
                                lastDataLine = { line: valueLine, valueRanges: [] };
                                currentLoop.dataLines.push(lastDataLine);
                            }

                            lastDataLine.valueRanges.push({
                                start: valueChar,
                                length: lineContent.length,
                                columnIndex: colIndex
                            });
                        }

                        // Coloring
                        const lineInRange = !range || (valueLine >= range.start.line && valueLine <= range.end.line);
                        if (builder && !isMassiveFile && lineInRange && lineContent.length > 0) {
                            builder.push(valueLine, valueChar, lineContent.length, tokenTypeIndex, 0);
                        }

                        valueLine++;
                        valueChar = 0; // Subsequent lines always start at 0
                    }

                    currentLoop.processedValueCount++;
                }
            } else if (type === 4) { // Comment
                // Ignore
            }
        }

        if (currentLoop && currentLoop.fieldNames.length > 0 && !isLargeFile) {
            loops.push(currentLoop);
        }

        tokens.delete();
        return loops;
    }
}
