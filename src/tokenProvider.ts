import * as vscode from "vscode";
import { CifParser as MmCifParser, LoopBlock } from "./parser";
import { LoopCache } from "./loopCache";
import { CursorHighlighter } from "./cursorHighlighter";
import { PlddtColorizer } from "./plddtColorizer";
import { RAINBOW_COLOR_COUNT } from "./constants";

const rainbowTokenTypes = [
    "rainbow1",  // category name
    "rainbow2",  // field name 1
    "rainbow3",  // field name 2
    "rainbow4",  // field name 3
    "rainbow5",  // field name 4
    "rainbow6",  // field name 5
    "rainbow7",  // field name 6
    "rainbow8",  // field name 7
    "rainbow9",  // field name 8
    "rainbow10"  // field name 9
];

export const tokensLegend = new vscode.SemanticTokensLegend(
    rainbowTokenTypes,
    []
);

/**
 * Provides semantic tokens for rainbow coloring of mmCIF files.
 */
export class MmCifTokenProvider implements vscode.DocumentSemanticTokensProvider {
    private parser: MmCifParser;

    constructor() {
        this.parser = new MmCifParser();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);

        await new Promise(resolve => setTimeout(resolve, 0));

        const loops = this.parser.parseLoops(document, builder);

        // Cache the loops for other features
        LoopCache.set(document.uri, document.version, loops);
        // Use getInstance() to ensure consistent instance usage
        CursorHighlighter.getInstance().updateEditor(vscode.window.activeTextEditor);
        PlddtColorizer.getInstance().updateEditor(vscode.window.activeTextEditor);

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
                    const fieldName = match[3];

                    const categoryStart = leadingSpaces;
                    const categoryLength = categoryName.length + 1;
                    builder.push(field.line, categoryStart, categoryLength, 0, 0);

                    const fieldStart = leadingSpaces + categoryName.length + 1;
                    const fieldLength = fieldName.length;

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (fieldIndex % RAINBOW_COLOR_COUNT);
                    } else {
                        tokenTypeIndex = 1 + (colorBaseIndex % RAINBOW_COLOR_COUNT);
                    }

                    builder.push(field.line, fieldStart, fieldLength, tokenTypeIndex, 0);
                }
            }

            for (const dataLine of loop.dataLines || []) {
                const maxCols = Math.min(loop.fieldNames.length, dataLine.valueRanges.length);
                for (let col = 0; col < maxCols; col++) {
                    const valueRange = dataLine.valueRanges[col];
                    const colIndex = valueRange.columnIndex ?? col;

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % RAINBOW_COLOR_COUNT);
                    } else {
                        tokenTypeIndex = 1 + (colorBaseIndex % RAINBOW_COLOR_COUNT);
                    }
                    builder.push(dataLine.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                }
            }
        }

        return builder.build();
    }
}
