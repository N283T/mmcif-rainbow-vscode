import * as vscode from 'vscode';

// Import WASM parser (dynamically loaded)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmParser = require('../cifparse-rs/pkg/cifparse_rs');

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

interface WasmLoopBlock {
    start_line: number;
    category_name: string;
    items: Array<{ line: number; start: number; length: number; name: string }>;
    names_defined: boolean;
    is_in_loop_block: boolean;
    processed_value_count: number;
    data_lines: Array<{
        line: number;
        value_ranges: Array<{ start: number; length: number; column_index: number }>;
    }>;
}

/**
 * Adapter: Convert WASM LoopBlock to TypeScript LoopBlock
 */
function adaptLoopBlock(wasmLoop: WasmLoopBlock): LoopBlock {
    return {
        startLine: wasmLoop.start_line,
        categoryName: wasmLoop.category_name,
        fieldNames: wasmLoop.items.map((item) => ({
            line: item.line,
            start: item.start,
            length: item.length,
            fieldName: item.name
        })),
        namesDefined: wasmLoop.names_defined,
        isInLoopBlock: wasmLoop.is_in_loop_block,
        processedValueCount: wasmLoop.processed_value_count,
        dataLines: wasmLoop.data_lines.map((dl) => ({
            line: dl.line,
            valueRanges: dl.value_ranges.map((vr) => ({
                start: vr.start,
                length: vr.length,
                columnIndex: vr.column_index
            }))
        }))
    };
}

export class CifParser {
    private wasmParser: typeof wasmParser.CifParser;

    constructor() {
        this.wasmParser = new wasmParser.CifParser();
    }

    /**
     * Parse loops from document using WASM parser
     */
    public parseLoops(document: vscode.TextDocument, builder?: vscode.SemanticTokensBuilder): LoopBlock[] {
        const text = document.getText();
        const wasmLoops: WasmLoopBlock[] = this.wasmParser.parse_loops(text);

        // Convert WASM loops to TypeScript loops
        const loops: LoopBlock[] = wasmLoops.map(adaptLoopBlock);

        // Apply semantic tokens if builder is provided
        if (builder) {
            this.applySemanticTokens(document, loops, builder);
        }

        return loops;
    }

    /**
     * Apply semantic tokens for rainbow coloring
     */
    private applySemanticTokens(
        document: vscode.TextDocument,
        loops: LoopBlock[],
        builder: vscode.SemanticTokensBuilder
    ): void {
        let categoryItemCount = 0;
        let lastCategory = "";

        for (const loop of loops) {
            let colorBaseIndex = 0;

            if (loop.isInLoopBlock) {
                lastCategory = "";
            } else {
                if (loop.categoryName !== lastCategory) {
                    categoryItemCount = 0;
                    lastCategory = loop.categoryName;
                } else {
                    categoryItemCount++;
                }
                colorBaseIndex = categoryItemCount;
            }

            for (let fieldIndex = 0; fieldIndex < loop.fieldNames.length; fieldIndex++) {
                const field = loop.fieldNames[fieldIndex];
                const lineText = document.lineAt(field.line).text;
                const match = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)(\s|$)/);

                if (match) {
                    const leadingSpaces = match[1]?.length || 0;
                    const categoryName = match[2];

                    // Category + dot token
                    const categoryStart = leadingSpaces;
                    const categoryLength = categoryName.length + 1;
                    builder.push(field.line, categoryStart, categoryLength, 0, 0);

                    // Field name token
                    const fieldStart = leadingSpaces + categoryName.length + 1;
                    const fieldLength = field.length;

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (fieldIndex % 8);
                    } else {
                        // Use colorBaseIndex for single items to cycle through rainbow
                        tokenTypeIndex = 1 + (colorBaseIndex % 8);
                    }

                    builder.push(field.line, fieldStart, fieldLength, tokenTypeIndex, 0);
                }
            }

            // Color data values
            for (const dataLine of loop.dataLines || []) {
                for (const valueRange of dataLine.valueRanges) {
                    const colIndex = valueRange.columnIndex;

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % 8);
                    } else {
                        // Use colorBaseIndex for single items
                        tokenTypeIndex = 1 + (colorBaseIndex % 8);
                    }

                    builder.push(dataLine.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                }
            }
        }
    }
}
