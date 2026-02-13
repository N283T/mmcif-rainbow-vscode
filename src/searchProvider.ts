import * as vscode from 'vscode';
import { BlockCache } from './blockCache';
import { SEARCH_HIGHLIGHT_DURATION_MS } from './constants';

export class SearchProvider implements vscode.Disposable {
    private highlightDecoration: vscode.TextEditorDecorationType;
    private highlightTimeoutId?: ReturnType<typeof setTimeout>;

    constructor() {
        this.highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)',
            isWholeLine: true
        });
    }

    dispose(): void {
        if (this.highlightTimeoutId) {
            clearTimeout(this.highlightTimeoutId);
        }
        this.highlightDecoration.dispose();
    }

    /**
     * Shows a QuickPick to search and jump to categories in the current document.
     */
    public async showSearch(editor: vscode.TextEditor): Promise<void> {
        const document = editor.document;
        const blocks = BlockCache.get(document.uri, document.version);

        if (!blocks) {
            vscode.window.showInformationMessage('No mmCIF data found or file is being parsed.');
            return;
        }

        // Extract unique categories
        const categories = new Set<string>();
        const categoryMap = new Map<string, { line: number, range: vscode.Range }>();

        for (const block of blocks) {
            if (block.categoryName && !categories.has(block.categoryName)) {
                categories.add(block.categoryName);

                let targetLine = block.startLine;
                let targetRange: vscode.Range;

                if (block.fieldNames.length > 0) {
                    const field = block.fieldNames[0];
                    targetLine = field.line;

                    targetRange = new vscode.Range(
                        targetLine, field.start,
                        targetLine, field.start + field.length
                    );
                } else {
                    targetRange = new vscode.Range(targetLine, 0, targetLine, 10);
                }

                categoryMap.set(block.categoryName, { line: targetLine, range: targetRange });
            }
        }

        const items: vscode.QuickPickItem[] = Array.from(categories).sort().map(cat => ({
            label: cat,
            description: `Line ${categoryMap.get(cat)!.line + 1}`
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Search categories...',
            matchOnDescription: true
        });

        if (selected) {
            const target = categoryMap.get(selected.label);
            if (target) {
                const position = new vscode.Position(target.line, 0);

                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(target.range, vscode.TextEditorRevealType.AtTop);

                editor.setDecorations(this.highlightDecoration, [target.range]);

                if (this.highlightTimeoutId) {
                    clearTimeout(this.highlightTimeoutId);
                }

                this.highlightTimeoutId = setTimeout(() => {
                    editor.setDecorations(this.highlightDecoration, []);
                    this.highlightTimeoutId = undefined;
                }, SEARCH_HIGHLIGHT_DURATION_MS);
            }
        }
    }
}
