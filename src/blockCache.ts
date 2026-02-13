import * as vscode from 'vscode';
import { CategoryBlock } from './parser';

/**
 * Simple cache to share parsed blocks between SemanticTokensProvider,
 * CursorHighlighter, HoverProvider, and PlddtColorizer.
 */
export class BlockCache {
    private static cache = new Map<string, { version: number, blocks: CategoryBlock[] }>();

    static set(uri: vscode.Uri, version: number, blocks: CategoryBlock[]) {
        this.cache.set(uri.toString(), { version, blocks });
    }

    static get(uri: vscode.Uri, version: number): CategoryBlock[] | undefined {
        const entry = this.cache.get(uri.toString());
        if (entry && entry.version === version) {
            return entry.blocks;
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
