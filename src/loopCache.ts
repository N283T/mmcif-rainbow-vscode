import * as vscode from 'vscode';
import { LoopBlock } from './parser';

/**
 * Simple cache to share parsed loops between SemanticTokensProvider,
 * CursorHighlighter, HoverProvider, and PlddtColorizer.
 */
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

    /**
     * Remove cached data for a document (called when document is closed)
     */
    static delete(uri: vscode.Uri): boolean {
        return this.cache.delete(uri.toString());
    }

    /**
     * Clear all cached data
     */
    static clear(): void {
        this.cache.clear();
    }
}
