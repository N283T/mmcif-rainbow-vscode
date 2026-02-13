import * as vscode from "vscode";
import { CifParser } from "./parser";
import { BlockCache } from "./blockCache";
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
 * Fires onDidProvideTokens after blocks are parsed and cached,
 * so decoration providers (pLDDT, cursor highlight) can update.
 */
export class MmCifTokenProvider implements vscode.DocumentSemanticTokensProvider {
    private parser: CifParser;
    private readonly _onDidProvideTokens = new vscode.EventEmitter<vscode.TextDocument>();
    readonly onDidProvideTokens = this._onDidProvideTokens.event;

    constructor() {
        this.parser = new CifParser();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);

        const blocks = this.parser.parseBlocks(document);

        // Cache the blocks for other features and notify listeners
        BlockCache.set(document.uri, document.version, blocks);
        this._onDidProvideTokens.fire(document);

        for (const block of blocks) {
            // Color field names (category prefix + field name)
            for (let fieldIndex = 0; fieldIndex < block.fieldNames.length; fieldIndex++) {
                const field = block.fieldNames[fieldIndex];

                // Category part (e.g. "_atom_site.")
                builder.push(field.line, field.categoryStart, field.categoryLength, 0, 0);

                // Field name part - uniform color by column index
                const tokenTypeIndex = 1 + (fieldIndex % RAINBOW_COLOR_COUNT);
                builder.push(field.line, field.start, field.length, tokenTypeIndex, 0);
            }

            // Color data values - uniform color by column index
            for (const dataRow of block.dataRows) {
                for (const valueRange of dataRow.valueRanges) {
                    if (valueRange.length > 0) {
                        const tokenTypeIndex = 1 + (valueRange.columnIndex % RAINBOW_COLOR_COUNT);
                        builder.push(dataRow.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                    }
                }
            }
        }

        return builder.build();
    }
}
