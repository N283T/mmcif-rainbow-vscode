import * as vscode from 'vscode';
import { LoopCache } from './loopCache';

export class SearchProvider {
    private highlightDecoration: vscode.TextEditorDecorationType;

    constructor() {
        this.highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow highlight with transparency
            isWholeLine: true
        });
    }

    /**
     * Shows a QuickPick to search and jump to categories in the current document.
     */
    public async showSearch(editor: vscode.TextEditor): Promise<void> {
        const document = editor.document;
        const loops = LoopCache.get(document.uri, document.version);

        if (!loops) {
            vscode.window.showInformationMessage('No mmCIF data found or file is being parsed.');
            return;
        }

        // Extract unique categories
        const categories = new Set<string>();
        // Map category name to { line, range } to jump to
        const categoryMap = new Map<string, { line: number, range: vscode.Range }>();

        for (const loop of loops) {
            if (loop.categoryName && !categories.has(loop.categoryName)) {
                categories.add(loop.categoryName);

                // Determine target position (first field name)
                let targetLine = loop.startLine;
                let targetRange: vscode.Range;

                if (loop.fieldNames.length > 0) {
                    // Use the first field's position
                    const field = loop.fieldNames[0];
                    targetLine = field.line;

                    targetRange = new vscode.Range(
                        targetLine, field.start,
                        targetLine, field.start + field.length
                    );
                } else {
                    // Fallback to startLine (shouldn't happen for valid loops)
                    targetRange = new vscode.Range(targetLine, 0, targetLine, 10);
                }

                categoryMap.set(loop.categoryName, { line: targetLine, range: targetRange });
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

                // Apply flash highlight to the specific target range
                editor.setDecorations(this.highlightDecoration, [target.range]);

                // Remove highlight after 1.5 seconds
                setTimeout(() => {
                    editor.setDecorations(this.highlightDecoration, []);
                }, 1500);
            }
        }
    }
}
