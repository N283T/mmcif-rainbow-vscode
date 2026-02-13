import * as vscode from 'vscode';
import { BlockCache } from './blockCache';

/**
 * Highlights the current column when cursor is in a category block.
 */
export class CursorHighlighter implements vscode.Disposable {
    private static instance: CursorHighlighter | undefined;
    private decorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px'
        });
    }

    static getInstance(): CursorHighlighter {
        if (!CursorHighlighter.instance) {
            CursorHighlighter.instance = new CursorHighlighter();
        }
        return CursorHighlighter.instance;
    }

    dispose(): void {
        this.decorationType.dispose();
        CursorHighlighter.instance = undefined;
    }

    updateEditor(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.languageId !== 'mmcif') {
            return;
        }

        const blocks = BlockCache.get(editor.document.uri, editor.document.version);
        if (!blocks) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const position = editor.selection.active;
        const rangesToHighlight: vscode.Range[] = [];

        for (const block of blocks) {
            let targetColumnIndex = -1;

            // Check if cursor is on any field name (header)
            for (let i = 0; i < block.fieldNames.length; i++) {
                const field = block.fieldNames[i];
                if (field.line === position.line) {
                    if (position.character >= field.start && position.character <= field.start + field.length) {
                        targetColumnIndex = i;
                        break;
                    }
                }
            }

            // Check if cursor is on any data value
            if (targetColumnIndex === -1) {
                for (const dataRow of block.dataRows) {
                    if (dataRow.line === position.line) {
                        for (const valueRange of dataRow.valueRanges) {
                            if (position.character >= valueRange.start && position.character <= valueRange.start + valueRange.length) {
                                targetColumnIndex = valueRange.columnIndex;
                                break;
                            }
                        }
                    }
                    if (targetColumnIndex !== -1) break;
                }
            }

            // If we found a column to highlight in this block
            if (targetColumnIndex !== -1) {
                // Collect header range
                if (targetColumnIndex < block.fieldNames.length) {
                    const field = block.fieldNames[targetColumnIndex];
                    rangesToHighlight.push(new vscode.Range(field.line, field.start, field.line, field.start + field.length));
                }

                // Collect all value ranges for this column
                for (const dataRow of block.dataRows) {
                    for (const valueRange of dataRow.valueRanges) {
                        if (valueRange.columnIndex === targetColumnIndex) {
                            rangesToHighlight.push(new vscode.Range(dataRow.line, valueRange.start, dataRow.line, valueRange.start + valueRange.length));
                        }
                    }
                }

                break;
            }
        }

        editor.setDecorations(this.decorationType, rangesToHighlight);
    }
}
