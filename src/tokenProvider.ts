import * as vscode from "vscode";
import { CifParser } from "./parser";
import { BlockCache } from "./blockCache";
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
    private parser: CifParser;

    constructor() {
        this.parser = new CifParser();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);

        await new Promise(resolve => setTimeout(resolve, 0));

        const blocks = this.parser.parseBlocks(document, builder);

        // Cache the blocks for other features
        BlockCache.set(document.uri, document.version, blocks);
        CursorHighlighter.getInstance().updateEditor(vscode.window.activeTextEditor);
        PlddtColorizer.getInstance().updateEditor(vscode.window.activeTextEditor);

        for (const block of blocks) {
            // Color field names
            for (let fieldIndex = 0; fieldIndex < block.fieldNames.length; fieldIndex++) {
                const field = block.fieldNames[fieldIndex];
                const lineText = document.lineAt(field.line).text;
                const match = lineText.match(/^(\s*)(_[A-Za-z0-9_]+)\.([A-Za-z0-9_\[\]]+)(\s|$)/);

                if (match) {
                    const leadingSpaces = match[1]?.length || 0;
                    const categoryName = match[2];
                    const fieldName = match[3];

                    // Category part (e.g. "_atom_site.")
                    const categoryStart = leadingSpaces;
                    const categoryLength = categoryName.length + 1;
                    builder.push(field.line, categoryStart, categoryLength, 0, 0);

                    // Field name part - uniform color by column index
                    const fieldStart = leadingSpaces + categoryName.length + 1;
                    const fieldLength = fieldName.length;
                    const tokenTypeIndex = 1 + (fieldIndex % RAINBOW_COLOR_COUNT);
                    builder.push(field.line, fieldStart, fieldLength, tokenTypeIndex, 0);
                }
            }

            // Color data values - uniform color by column index
            for (const dataRow of block.dataRows) {
                for (const valueRange of dataRow.valueRanges) {
                    const tokenTypeIndex = 1 + (valueRange.columnIndex % RAINBOW_COLOR_COUNT);
                    builder.push(dataRow.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                }
            }
        }

        return builder.build();
    }
}
