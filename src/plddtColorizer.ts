import * as vscode from 'vscode';
import { LoopCache } from './loopCache';
import { DICTIONARY_DETECTION_LINE_LIMIT, PLDDT_THRESHOLDS, PLDDT_COLORS } from './constants';

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
export class PlddtColorizer implements vscode.Disposable {
    private static instance: PlddtColorizer | undefined;

    private veryHighConfidence: vscode.TextEditorDecorationType;
    private highConfidence: vscode.TextEditorDecorationType;
    private lowConfidence: vscode.TextEditorDecorationType;
    private veryLowConfidence: vscode.TextEditorDecorationType;

    constructor() {
        this.veryHighConfidence = vscode.window.createTextEditorDecorationType({
            color: PLDDT_COLORS.VERY_HIGH,
            fontWeight: 'bold'
        });
        this.highConfidence = vscode.window.createTextEditorDecorationType({
            color: PLDDT_COLORS.HIGH,
            fontWeight: 'bold'
        });
        this.lowConfidence = vscode.window.createTextEditorDecorationType({
            color: PLDDT_COLORS.LOW,
            fontWeight: 'bold'
        });
        this.veryLowConfidence = vscode.window.createTextEditorDecorationType({
            color: PLDDT_COLORS.VERY_LOW,
            fontWeight: 'bold'
        });
    }

    static getInstance(): PlddtColorizer {
        if (!PlddtColorizer.instance) {
            PlddtColorizer.instance = new PlddtColorizer();
        }
        return PlddtColorizer.instance;
    }

    dispose(): void {
        this.veryHighConfidence.dispose();
        this.highConfidence.dispose();
        this.lowConfidence.dispose();
        this.veryLowConfidence.dispose();
        PlddtColorizer.instance = undefined;
    }

    /**
     * Check if document is a ModelCIF file (AlphaFold, etc.)
     * Uses line-by-line reading to avoid loading entire file into memory.
     */
    isModelCif(document: vscode.TextDocument): boolean {
        const lineLimit = Math.min(document.lineCount, DICTIONARY_DETECTION_LINE_LIMIT);
        for (let i = 0; i < lineLimit; i++) {
            const line = document.lineAt(i).text;
            if (line.includes('_audit_conform.dict_name') && line.includes('mmcif_ma.dic')) {
                return true;
            }
        }
        return false;
    }

    /**
     * @deprecated Use getInstance().isModelCif() instead
     */
    static isModelCif(document: vscode.TextDocument): boolean {
        return PlddtColorizer.getInstance().isModelCif(document);
    }

    /**
     * @deprecated Use getInstance().updateEditor() instead
     */
    static update(editor: vscode.TextEditor | undefined): void {
        PlddtColorizer.getInstance().updateEditor(editor);
    }

    /**
     * Update pLDDT coloring for the given editor
     */
    updateEditor(editor: vscode.TextEditor | undefined): void {
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

                        if (plddt > PLDDT_THRESHOLDS.VERY_HIGH) {
                            veryHighRanges.push(range);
                        } else if (plddt > PLDDT_THRESHOLDS.HIGH) {
                            highRanges.push(range);
                        } else if (plddt > PLDDT_THRESHOLDS.LOW) {
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
