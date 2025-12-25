import * as vscode from "vscode";
import { WasmCifParser, LoopBlock } from "./wasmParser";

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

export const tokensLegend = new vscode.SemanticTokensLegend(
    rainbowTokenTypes,
    []
);

const warnedFiles = new Set<string>();

export class MmCifTokenProvider implements vscode.DocumentSemanticTokensProvider {
    private parser: WasmCifParser;

    constructor() {
        this.parser = new WasmCifParser();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Highlighting mmCIF...",
            cancellable: false
        }, async (progress) => {
            const builder = new vscode.SemanticTokensBuilder(tokensLegend);

            // Allow UI to update before blocking
            await new Promise(resolve => setTimeout(resolve, 0));

            const loops = this.parser.parseLoops(document, builder);

            // Cache the loops for other features (highlighter, hover)
            LoopCache.set(document.uri, document.version, loops);
            // Trigger update for highlighter since we have fresh loops
            CursorHighlighter.update(vscode.window.activeTextEditor);

            return builder.build();
        });
    }

    async provideDocumentRangeSemanticTokens(
        document: vscode.TextDocument,
        range: vscode.Range
    ): Promise<vscode.SemanticTokens> {
        // Range provider is often allowed for large files where full provider is blocked.
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Highlighting mmCIF (Range)...",
            cancellable: false
        }, async (progress) => {
            const builder = new vscode.SemanticTokensBuilder(tokensLegend);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Pass range to parser to filter token output
            const loops = this.parser.parseLoops(document, builder, range);

            // We still update the cache with the (potentially partial?) loops structure
            // Actually parser returns full loops structure (for context) but only colored the range.
            LoopCache.set(document.uri, document.version, loops);
            CursorHighlighter.update(vscode.window.activeTextEditor);

            return builder.build();
        });
    }
}

// Simple cache to share parsed loops between SemanticTokensProvider, CursorHighlighter, and HoverProvider
export class LoopCache {
    private static cache = new Map<string, { version: number, loops: LoopBlock[] }>();

    static set(uri: vscode.Uri, version: number, loops: LoopBlock[]) {
        this.cache.set(uri.toString(), { version, loops });
    }

    static get(uri: vscode.Uri, version: number): LoopBlock[] | undefined {
        const entry = this.cache.get(uri.toString());
        if (entry && entry.version === version) {
            return entry.loops;
        }
        return undefined;
    }
}

export class CursorHighlighter {
    private static decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 255, 0.1)', // Subtle highlight
        borderRadius: '2px'
    });

    static update(editor: vscode.TextEditor | undefined) {
        if (!editor || editor.document.languageId !== 'mmcif') {
            return;
        }

        const loops = LoopCache.get(editor.document.uri, editor.document.version);
        if (!loops) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const position = editor.selection.active;
        const rangesToHighlight: vscode.Range[] = [];

        for (const loop of loops) {
            let targetColumnIndex = -1;

            // 1. Check if cursor is on any field name (header)
            for (let i = 0; i < loop.fieldNames.length; i++) {
                const field = loop.fieldNames[i];
                if (field.line === position.line) {
                    // Simple range check
                    if (position.character >= field.start && position.character <= field.start + field.length) {
                        targetColumnIndex = i;
                        break;
                    }
                }
            }

            // 2. Check if cursor is on any data value
            if (targetColumnIndex === -1) {
                for (const dataLine of loop.dataLines) {
                    if (dataLine.line === position.line) {
                        for (const valueRange of dataLine.valueRanges) {
                            if (position.character >= valueRange.start && position.character <= valueRange.start + valueRange.length) {
                                targetColumnIndex = valueRange.columnIndex;
                                break;
                            }
                        }
                    }
                    if (targetColumnIndex !== -1) break;
                }
            }

            // If we found a column to highlight in this loop
            if (targetColumnIndex !== -1) {
                // Collect header range
                if (targetColumnIndex < loop.fieldNames.length) {
                    const field = loop.fieldNames[targetColumnIndex];
                    rangesToHighlight.push(new vscode.Range(field.line, field.start, field.line, field.start + field.length));
                }

                // Collect all value ranges for this column
                for (const dataLine of loop.dataLines) {
                    for (const valueRange of dataLine.valueRanges) {
                        if (valueRange.columnIndex === targetColumnIndex) {
                            rangesToHighlight.push(new vscode.Range(dataLine.line, valueRange.start, dataLine.line, valueRange.start + valueRange.length));
                        }
                    }
                }

                break;
            }
        }

        editor.setDecorations(this.decorationType, rangesToHighlight);
    }
}

export class MmCifHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const loops = LoopCache.get(document.uri, document.version);
        if (!loops) return null;

        for (const loop of loops) {
            // Check if cursor is on a data value
            for (const dataLine of loop.dataLines) {
                if (dataLine.line === position.line) {
                    for (const valueRange of dataLine.valueRanges) {
                        if (position.character >= valueRange.start && position.character <= valueRange.start + valueRange.length) {
                            const columnIndex = valueRange.columnIndex;
                            if (columnIndex < loop.fieldNames.length) {
                                const field = loop.fieldNames[columnIndex];
                                const fullTagName = `${loop.categoryName}.${field.fieldName}`;
                                return new vscode.Hover(new vscode.MarkdownString(`**${fullTagName}**`));
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
}
