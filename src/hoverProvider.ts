import * as vscode from 'vscode';
import { LoopCache } from './loopCache';
import { DictionaryManager } from './dictionary';

/**
 * Provides hover information for mmCIF categories and items.
 */
export class MmCifHoverProvider implements vscode.HoverProvider {
    private currentDocument?: vscode.TextDocument;

    constructor(private dictionaryManager: DictionaryManager) { }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        this.currentDocument = document;
        const loops = LoopCache.get(document.uri, document.version);
        if (!loops) return null;

        for (const loop of loops) {
            // Check if cursor is on a field name (header)
            for (let i = 0; i < loop.fieldNames.length; i++) {
                const field = loop.fieldNames[i];
                if (field.line === position.line) {
                    const categoryName = loop.categoryName;
                    const fieldName = field.fieldName;

                    const categoryStart = field.start - 1 - categoryName.length;
                    const categoryEnd = field.start - 1;

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
            const catDef = this.dictionaryManager.getCategory(categoryName, this.currentDocument);
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

        md.appendMarkdown(`### **${fullTagName}**\n\n`);
        md.appendMarkdown(`[Online Documentation](${itemUrl})\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`Category : [\`${cleanCatName}\`](${catUrl})\n\n`);
        md.appendMarkdown(`Attribute : \`${fieldName}\`\n\n`);

        const itemDef = this.dictionaryManager.getItem(categoryName, fieldName, this.currentDocument);

        md.appendMarkdown(`---\n\n`);

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
