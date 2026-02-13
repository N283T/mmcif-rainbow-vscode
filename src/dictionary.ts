import * as vscode from 'vscode';
import { DICTIONARY_DETECTION_LINE_LIMIT } from './constants';
import { Logger } from './logger';

export interface ItemDefinition {
    description: string;
}

export interface CategoryDefinition {
    description: string;
    items: Map<string, ItemDefinition>;
}

export interface DictionaryData {
    categories: Map<string, CategoryDefinition>;
}

// Interfaces for the raw JSON structure
interface RawFrame {
    "_category.id"?: string;
    "_category.description"?: string | string[];
    "_item.name"?: string | string[];
    "_item.category_id"?: string | string[];
    "_item_description.description"?: string | string[];
    [key: string]: any;
}

interface RawDictionary {
    [BLOCK_ID: string]: {
        Frames: {
            [FRAME_NAME: string]: RawFrame;
        };
    };
}

// Dictionary type based on _audit_conform.dict_name
export type DictionaryType = 'mmcif_pdbx' | 'mmcif_ma';

// Mapping from dict_name to dictionary file
const DICTIONARY_FILES: Record<DictionaryType, string> = {
    'mmcif_pdbx': 'mmcif_pdbx_v50.dic.json',
    'mmcif_ma': 'mmcif_ma.dic.json',
};

export class DictionaryManager {
    private static instance: DictionaryManager;

    // Store dictionaries by type
    private dictionaries: Map<DictionaryType, DictionaryData> = new Map();
    private loadingPromises: Map<DictionaryType, Promise<void>> = new Map();

    // Current active dictionary type (per-document tracking)
    private documentDictTypes: Map<string, DictionaryType> = new Map();

    private extensionUri?: vscode.Uri;

    public status: 'Initial' | 'Loading' | 'Loaded' | 'Failed' = 'Initial';
    public error?: string;

    private constructor() { }

    public static getInstance(): DictionaryManager {
        if (!DictionaryManager.instance) {
            DictionaryManager.instance = new DictionaryManager();
        }
        return DictionaryManager.instance;
    }

    public setExtensionUri(uri: vscode.Uri) {
        this.extensionUri = uri;
    }

    /**
     * Load the default dictionary (PDBx/mmCIF)
     */
    public async loadDictionary(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        await this.loadDictionaryByType('mmcif_pdbx');
    }

    /**
     * Load a specific dictionary type
     */
    public async loadDictionaryByType(dictType: DictionaryType): Promise<void> {
        if (!this.extensionUri) {
            throw new Error('Extension URI not set');
        }

        // Return existing promise if already loading
        const existingPromise = this.loadingPromises.get(dictType);
        if (existingPromise) {
            return existingPromise;
        }

        // Return immediately if already loaded
        if (this.dictionaries.has(dictType)) {
            return;
        }

        const loadPromise = this.doLoadDictionary(dictType);
        this.loadingPromises.set(dictType, loadPromise);

        try {
            await loadPromise;
        } finally {
            this.loadingPromises.delete(dictType);
        }
    }

    private async doLoadDictionary(dictType: DictionaryType): Promise<void> {
        const fileName = DICTIONARY_FILES[dictType];
        const dicUri = vscode.Uri.joinPath(this.extensionUri!, 'assets', fileName);

        Logger.getInstance().info(`Loading ${dictType} dictionary from ${dicUri.toString()}...`);
        this.status = 'Loading';

        try {
            const data = await vscode.workspace.fs.readFile(dicUri);
            const content = new TextDecoder().decode(data);
            const json = JSON.parse(content) as RawDictionary;

            const dictionary: DictionaryData = { categories: new Map() };

            // Find the Frames block
            let frames: { [key: string]: RawFrame } | undefined;
            for (const key in json) {
                if (json[key] && json[key].Frames) {
                    frames = json[key].Frames;
                    break;
                }
            }

            if (!frames) {
                throw new Error("Invalid dictionary JSON: No 'Frames' block found.");
            }

            const startTime = Date.now();
            let itemCount = 0;

            // First pass: Initialize categories
            for (const frameName in frames) {
                const frame = frames[frameName];
                if (frame["_category.id"]) {
                    const id = frame["_category.id"];
                    const desc = this.extractString(frame["_category.description"]);

                    if (!dictionary.categories.has(id)) {
                        dictionary.categories.set(id, {
                            description: this.cleanDescription(desc),
                            items: new Map()
                        });
                    }
                }
            }

            // Second pass: Add items
            for (const frameName in frames) {
                const frame = frames[frameName];
                const rawNames = frame["_item.name"];
                const rawCats = frame["_item.category_id"];

                if (rawNames) {
                    const names = (Array.isArray(rawNames) ? rawNames : [rawNames]) as string[];
                    const cats = (Array.isArray(rawCats) ? rawCats : [rawCats]) as string[];

                    const desc = this.extractString(frame["_item_description.description"]);

                    for (let i = 0; i < names.length; i++) {
                        const itemName = names[i];
                        const categoryId = cats[i] || cats[0];

                        if (!itemName || !categoryId) continue;

                        if (!dictionary.categories.has(categoryId)) {
                            dictionary.categories.set(categoryId, {
                                description: "",
                                items: new Map()
                            });
                        }

                        const catDef = dictionary.categories.get(categoryId)!;
                        const parts = itemName.split('.');
                        if (parts.length >= 2) {
                            const attrName = parts.slice(1).join('.');
                            catDef.items.set(attrName, {
                                description: this.cleanDescription(desc),
                            });
                            itemCount++;
                        }
                    }
                }
            }

            this.dictionaries.set(dictType, dictionary);
            const duration = Date.now() - startTime;
            this.status = 'Loaded';
            Logger.getInstance().info(`Dictionary ${dictType} loaded in ${duration}ms. Categories: ${dictionary.categories.size}, Items: ${itemCount}`);

        } catch (e: any) {
            Logger.getInstance().error(`Error loading ${dictType} dictionary`, e);
            this.status = 'Failed';
            this.error = e.message;

            // Notify user about the dictionary load failure
            vscode.window.showWarningMessage(
                `mmCIF Rainbow: Failed to load ${dictType} dictionary. Hover documentation may be unavailable. Error: ${e.message}`
            );

            throw e;
        }
    }

    /**
     * Detect dictionary type from document content.
     * Uses line-by-line reading to avoid loading entire file into memory for large files.
     */
    public detectDictionaryTypeFromDocument(document: vscode.TextDocument): DictionaryType {
        const lineLimit = Math.min(document.lineCount, DICTIONARY_DETECTION_LINE_LIMIT);
        for (let i = 0; i < lineLimit; i++) {
            const line = document.lineAt(i).text;
            if (line.includes('_audit_conform.dict_name')) {
                if (line.includes('mmcif_ma.dic')) {
                    return 'mmcif_ma';
                }
            }
        }
        // Default to PDBx dictionary
        return 'mmcif_pdbx';
    }

    /**
     * Set dictionary type for a document
     */
    public async setDocumentDictionary(document: vscode.TextDocument): Promise<DictionaryType> {
        const dictType = this.detectDictionaryTypeFromDocument(document);
        this.documentDictTypes.set(document.uri.toString(), dictType);

        // Ensure the dictionary is loaded
        await this.loadDictionaryByType(dictType);

        return dictType;
    }

    /**
     * Remove document tracking data (called when document is closed)
     */
    public removeDocument(uri: string): void {
        this.documentDictTypes.delete(uri);
    }

    /**
     * Get dictionary type for a document
     */
    public getDocumentDictionaryType(document: vscode.TextDocument): DictionaryType {
        return this.documentDictTypes.get(document.uri.toString()) || 'mmcif_pdbx';
    }

    /**
     * Get dictionary for a specific document
     */
    private getDictionaryForDocument(document?: vscode.TextDocument): DictionaryData | undefined {
        const dictType = document
            ? this.getDocumentDictionaryType(document)
            : 'mmcif_pdbx';
        return this.dictionaries.get(dictType);
    }

    public getCategory(name: string, document?: vscode.TextDocument): CategoryDefinition | undefined {
        const dictionary = this.getDictionaryForDocument(document);
        if (!dictionary) return undefined;
        const cleanName = name.startsWith('_') ? name.substring(1) : name;
        return dictionary.categories.get(cleanName);
    }

    public getItem(category: string, item: string, document?: vscode.TextDocument): ItemDefinition | undefined {
        const dictionary = this.getDictionaryForDocument(document);
        if (!dictionary) return undefined;
        const cat = this.getCategory(category, document);
        if (cat) {
            return cat.items.get(item);
        }
        return undefined;
    }

    private extractString(val: any): string {
        if (Array.isArray(val)) {
            return val.join('\n');
        }
        return val ? String(val) : "";
    }

    private cleanDescription(desc: string): string {
        if (!desc) return "";
        return desc.trim();
    }
}
