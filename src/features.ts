import * as vscode from "vscode";
import { CifParser as MmCifParser, LoopBlock } from "./parser";

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

export class MmCifTokenProvider implements vscode.DocumentSemanticTokensProvider {
    private parser: MmCifParser;

    constructor() {
        this.parser = new MmCifParser();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): Promise<vscode.SemanticTokens> {
        const builder = new vscode.SemanticTokensBuilder(tokensLegend);

        // Allow UI to update before blocking
        await new Promise(resolve => setTimeout(resolve, 0));

        const loops = this.parser.parseLoops(document, builder);

        // Cache the loops for other features (highlighter, hover)
        LoopCache.set(document.uri, document.version, loops);
        // Trigger update for highlighter since we have fresh loops
        CursorHighlighter.update(vscode.window.activeTextEditor);

        // State for tracking single items (non-loop) to cycle colors per category
        let categoryItemCount = 0;
        let lastCategory = "";

        for (const loop of loops) {
            // Determine color index base for this loop/item
            let colorBaseIndex = 0;

            if (loop.isInLoopBlock) {
                // Loop blocks handle their own internal rotation
                lastCategory = ""; // Reset category tracking when hitting a loop block
            } else {
                // Single Item
                if (loop.categoryName !== lastCategory) {
                    categoryItemCount = 0;
                    lastCategory = loop.categoryName;
                } else {
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

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        // Inside loop_ block: use field index within the loop
                        tokenTypeIndex = 1 + (fieldIndex % 8); // rainbow2-rainbow9
                    } else {
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

                    let tokenTypeIndex: number;
                    if (loop.isInLoopBlock) {
                        tokenTypeIndex = 1 + (colIndex % 8); // same rule as header fields: rainbow2-rainbow9
                    } else {
                        tokenTypeIndex = 1 + (colorBaseIndex % 8);
                    }
                    builder.push(dataLine.line, valueRange.start, valueRange.length, tokenTypeIndex, 0);
                }
            }
        }

        return builder.build();

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

import { DictionaryManager } from "./dictionary";

export class MmCifHoverProvider implements vscode.HoverProvider {
    constructor(private dictionaryManager: DictionaryManager) { }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const loops = LoopCache.get(document.uri, document.version);
        if (!loops) return null;

        for (const loop of loops) {
            // Check if cursor is on a field name (header)
            // This allows hovering on "_atom_site.Cartn_x" to show details
            for (let i = 0; i < loop.fieldNames.length; i++) {
                const field = loop.fieldNames[i];
                if (field.line === position.line) {
                    const categoryName = loop.categoryName;
                    const fieldName = field.fieldName;

                    const categoryStart = field.start - 1 - categoryName.length;
                    const categoryEnd = field.start - 1; // before dot

                    // Check if cursor is on Category part
                    if (position.character >= categoryStart && position.character < categoryEnd) {
                        return this.createCategoryHover(categoryName);
                    }

                    // Check if cursor is on Attribute part
                    if (position.character >= field.start && position.character <= field.start + field.length) {
                        return this.createItemHover(categoryName, fieldName);
                    }
                }
            }

            // Check if cursor is on a data value
            for (const dataLine of loop.dataLines) {
                if (dataLine.line === position.line) {
                    for (const valueRange of dataLine.valueRanges) {
                        if (position.character >= valueRange.start && position.character <= valueRange.start + valueRange.length) {
                            const columnIndex = valueRange.columnIndex;
                            if (columnIndex < loop.fieldNames.length) {
                                const field = loop.fieldNames[columnIndex];
                                return this.createValueHover(loop.categoryName, field.fieldName);
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    private createValueHover(categoryName: string, fieldName: string): vscode.Hover {
        const fullTagName = `${categoryName}.${fieldName}`;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${fullTagName}**`);
        return new vscode.Hover(md);
    }

    private createCategoryHover(categoryName: string): vscode.Hover {
        const md = new vscode.MarkdownString();
        const cleanName = this.getCleanCategoryName(categoryName);
        const url = this.getCategoryUrl(cleanName);

        md.appendMarkdown(`### **${categoryName}**\n\n`);
        md.appendMarkdown(`[Online Documentation](${url})\n\n`);
        md.appendMarkdown(`---\n\n`);

        if (this.dictionaryManager.status === 'Loaded') {
            const catDef = this.dictionaryManager.getCategory(categoryName);
            if (catDef) {
                md.appendMarkdown(`${catDef.description}`);
            }
        } else if (this.dictionaryManager.status === 'Loading') {
            md.appendMarkdown(`*(Dictionary is loading...)*`);
        } else if (this.dictionaryManager.status === 'Failed') {
            md.appendMarkdown(`*(Dictionary load failed: ${this.dictionaryManager.error})*`);
        }

        return new vscode.Hover(md);
    }

    private createItemHover(categoryName: string, fieldName: string): vscode.Hover {
        const fullTagName = `${categoryName}.${fieldName}`;
        const cleanCatName = this.getCleanCategoryName(categoryName);
        const itemUrl = this.getItemUrl(cleanCatName, fieldName);
        const catUrl = this.getCategoryUrl(cleanCatName);

        const md = new vscode.MarkdownString();

        // 1. Header (Simplified)
        md.appendMarkdown(`### **${fullTagName}**\n\n`);
        md.appendMarkdown(`[Online Documentation](${itemUrl})\n\n`);

        md.appendMarkdown(`---\n\n`);

        // 2. Metadata
        md.appendMarkdown(`Category : [\`${cleanCatName}\`](${catUrl})\n\n`);
        md.appendMarkdown(`Attribute : \`${fieldName}\`\n\n`);

        const itemDef = this.dictionaryManager.getItem(categoryName, fieldName);

        md.appendMarkdown(`---\n\n`);

        // 3. Diagnostics or Content
        if (this.dictionaryManager.status !== 'Loaded') {
            if (this.dictionaryManager.status === 'Loading') {
                md.appendMarkdown(`*(Dictionary is loading...)*`);
            } else if (this.dictionaryManager.status === 'Failed') {
                md.appendMarkdown(`*(Dictionary load failed: ${this.dictionaryManager.error})*\n\n`);
                md.appendMarkdown(`*Please report this issue on GitHub.*`);
            }
        } else {
            if (itemDef) {
                if (itemDef.description) {
                    md.appendMarkdown(`${itemDef.description}\n\n`);
                }
            } else {
                md.appendMarkdown(`*(No dictionary definition found)*\n\n`);
            }
        }

        return new vscode.Hover(md);
    }

    private getCleanCategoryName(name: string): string {
        return name.replace(/^_/, '');
    }

    private getCategoryUrl(cleanName: string): string {
        return `https://mmcif.wwpdb.org/dictionaries/mmcif_pdbx_v50.dic/Categories/${cleanName}.html`;
    }

    private getItemUrl(cleanCatName: string, fieldName: string): string {
        return `https://mmcif.wwpdb.org/dictionaries/mmcif_pdbx_v50.dic/Items/_${cleanCatName}.${fieldName}.html`;
    }
}
