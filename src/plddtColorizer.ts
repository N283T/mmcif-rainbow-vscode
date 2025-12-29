import * as vscode from 'vscode';
import { LoopCache } from './loopCache';

/**
 * pLDDT Colorizer - Applies AlphaFold confidence colors to B_iso_or_equiv values
 * in ModelCIF files (where _audit_conform.dict_name = mmcif_ma.dic)
 *
 * pLDDT Color scheme:
 * - pLDDT > 90: #0053D6 (dark blue - very high confidence)
 * - 70 < pLDDT <= 90: #65CBF3 (light blue - confident)
 * - 50 < pLDDT <= 70: #FFDB13 (yellow - low confidence)
 * - pLDDT <= 50: #FF7D45 (orange - very low confidence)
 */
export class PlddtColorizer {
    private static veryHighConfidence = vscode.window.createTextEditorDecorationType({
        color: '#0053D6',
        fontWeight: 'bold'
    });
    private static highConfidence = vscode.window.createTextEditorDecorationType({
        color: '#65CBF3',
        fontWeight: 'bold'
    });
    private static lowConfidence = vscode.window.createTextEditorDecorationType({
        color: '#FFDB13',
        fontWeight: 'bold'
    });
    private static veryLowConfidence = vscode.window.createTextEditorDecorationType({
        color: '#FF7D45',
        fontWeight: 'bold'
    });

    /**
     * Check if document is a ModelCIF file (AlphaFold, etc.)
     */
    static isModelCif(document: vscode.TextDocument): boolean {
        const text = document.getText();
        const lines = text.split('\n').slice(0, 500);
        for (const line of lines) {
            if (line.includes('_audit_conform.dict_name') && line.includes('mmcif_ma.dic')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Update pLDDT coloring for the given editor
     */
    static update(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.languageId !== 'mmcif') {
            return;
        }

        const document = editor.document;

        if (!this.isModelCif(document)) {
            editor.setDecorations(this.veryHighConfidence, []);
            editor.setDecorations(this.highConfidence, []);
            editor.setDecorations(this.lowConfidence, []);
            editor.setDecorations(this.veryLowConfidence, []);
            return;
        }

        const loops = LoopCache.get(document.uri, document.version);
        if (!loops) {
            return;
        }

        const veryHighRanges: vscode.Range[] = [];
        const highRanges: vscode.Range[] = [];
        const lowRanges: vscode.Range[] = [];
        const veryLowRanges: vscode.Range[] = [];

        for (const loop of loops) {
            if (!loop.categoryName.includes('atom_site')) {
                continue;
            }

            let bIsoColumnIndex = -1;
            for (let i = 0; i < loop.fieldNames.length; i++) {
                if (loop.fieldNames[i].fieldName === 'B_iso_or_equiv') {
                    bIsoColumnIndex = i;
                    break;
                }
            }

            if (bIsoColumnIndex === -1) {
                continue;
            }

            for (const dataLine of loop.dataLines) {
                for (const valueRange of dataLine.valueRanges) {
                    if (valueRange.columnIndex === bIsoColumnIndex) {
                        const lineText = document.lineAt(dataLine.line).text;
                        const valueText = lineText.substring(
                            valueRange.start,
                            valueRange.start + valueRange.length
                        );

                        const plddt = parseFloat(valueText);
                        if (isNaN(plddt)) {
                            continue;
                        }

                        const range = new vscode.Range(
                            dataLine.line, valueRange.start,
                            dataLine.line, valueRange.start + valueRange.length
                        );

                        if (plddt > 90) {
                            veryHighRanges.push(range);
                        } else if (plddt > 70) {
                            highRanges.push(range);
                        } else if (plddt > 50) {
                            lowRanges.push(range);
                        } else {
                            veryLowRanges.push(range);
                        }
                    }
                }
            }
        }

        editor.setDecorations(this.veryHighConfidence, veryHighRanges);
        editor.setDecorations(this.highConfidence, highRanges);
        editor.setDecorations(this.lowConfidence, lowRanges);
        editor.setDecorations(this.veryLowConfidence, veryLowRanges);
    }
}
