
import * as assert from 'assert';
import * as vscode from 'vscode';
import { DictionaryManager } from '../dictionary';

suite('Dictionary Manager Test Suite', () => {
    vscode.window.showInformationMessage('Start Dictionary Manager tests.');

    test('Loads JSON Dictionary from Assets', async () => {
        const ext = vscode.extensions.getExtension('N283T.mmcif-rainbow');
        assert.ok(ext, 'Extension not found');

        const manager = DictionaryManager.getInstance();
        await manager.loadDictionary(ext.extensionUri);

        assert.strictEqual(manager.status, 'Loaded');

        // Check category existence
        const atomSiteCat = manager.getCategory('atom_site');
        assert.ok(atomSiteCat, 'atom_site category should be present');
        assert.ok(atomSiteCat.description.length > 0, 'atom_site should have description');

        // Check item existence and description
        // _atom_site.id matches raw JSON structure tests
        const idItem = manager.getItem('atom_site', 'id');
        assert.ok(idItem, '_atom_site.id should be present');
        assert.ok(idItem.description.includes('uniquely identify'), 'Description should match');

        // Check alias/derived item
        const labelItem = manager.getItem('atom_site', 'label_atom_id');
        assert.ok(labelItem, '_atom_site.label_atom_id should be present');
        console.log('label_atom_id description:', labelItem.description.substring(0, 50) + '...');
        assert.ok(labelItem.description.length > 0, 'label_atom_id should have description');
    });
});
