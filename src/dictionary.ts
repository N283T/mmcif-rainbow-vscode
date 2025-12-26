
import * as vscode from 'vscode';

export interface ItemDefinition {
    description: string;
    type?: string;
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
    "_item_type.code"?: string | string[];
    [key: string]: any;
}

interface RawDictionary {
    [BLOCK_ID: string]: {
        Frames: {
            [FRAME_NAME: string]: RawFrame;
        };
    };
}

export class DictionaryManager {
    private static instance: DictionaryManager;
    private dictionary?: DictionaryData;

    public status: 'Initial' | 'Loading' | 'Loaded' | 'Failed' = 'Initial';
    public error?: string;

    private constructor() { }

    public static getInstance(): DictionaryManager {
        if (!DictionaryManager.instance) {
            DictionaryManager.instance = new DictionaryManager();
        }
        return DictionaryManager.instance;
    }

    public async loadDictionary(extensionUri: vscode.Uri) {
        if (this.status === 'Loading' || this.status === 'Loaded') return;

        this.status = 'Loading';
        console.log('DictionaryManager: Starting load from JSON...');

        const dicUri = vscode.Uri.joinPath(extensionUri, 'assets', 'mmcif_pdbx_v50.dic.json');
        console.log(`DictionaryManager: Loading ${dicUri.toString()}`);

        try {
            const data = await vscode.workspace.fs.readFile(dicUri);
            const content = new TextDecoder().decode(data);
            const json = JSON.parse(content) as RawDictionary;

            this.dictionary = { categories: new Map() };

            // The JSON has a root key like "mmcif_pdbx.dic"
            // We'll take the first key that has a "Frames" property
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

                    if (!this.dictionary.categories.has(id)) {
                        this.dictionary.categories.set(id, {
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
                    const names: any[] = Array.isArray(rawNames) ? rawNames : [rawNames];
                    const cats: any[] = Array.isArray(rawCats) ? rawCats : [rawCats];

                    const desc = this.extractString(frame["_item_description.description"]);
                    const typeSnippet = this.extractString(frame["_item_type.code"]);

                    for (let i = 0; i < names.length; i++) {
                        const itemName = names[i];
                        const categoryId = cats[i] || cats[0]; // Robust fallback

                        if (!itemName || !categoryId) continue;

                        if (!this.dictionary.categories.has(categoryId)) {
                            // Create orphan category if not exists (should be rare)
                            this.dictionary.categories.set(categoryId, {
                                description: "",
                                items: new Map()
                            });
                        }

                        const catDef = this.dictionary.categories.get(categoryId)!;

                        const parts = itemName.split('.');
                        if (parts.length >= 2) {
                            const attrName = parts.slice(1).join('.');
                            catDef.items.set(attrName, {
                                description: this.cleanDescription(desc),
                                type: typeSnippet
                            });
                            itemCount++;
                        }
                    }
                }
            }

            const duration = Date.now() - startTime;
            this.status = 'Loaded';
            console.log(`Dictionary loaded in ${duration}ms. Categories: ${this.dictionary.categories.size}, Items: ${itemCount}`);

        } catch (e: any) {
            console.error(`DictionaryManager: Error loading ${dicUri.toString()}:`, e);
            this.status = 'Failed';
            this.error = e.message;
        }
    }

    public getCategory(name: string): CategoryDefinition | undefined {
        if (!this.dictionary) return undefined;
        // The dictionary stores "atom_site", query might be "_atom_site"
        const cleanName = name.startsWith('_') ? name.substring(1) : name;
        return this.dictionary.categories.get(cleanName);
    }

    public getItem(category: string, item: string): ItemDefinition | undefined {
        if (!this.dictionary) return undefined;
        const cat = this.getCategory(category);
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
