import * as assert from 'assert';
import * as vscode from 'vscode';
import { CifParser } from '../../parser';

suite('CifParser Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    const parser = new CifParser();

    // Helper to create a mock document from an array of strings
    function createMockDocument(lines: string[]): vscode.TextDocument {
        return {
            lineCount: lines.length,
            lineAt: (i: number) => ({ text: lines[i] }),
            getText: () => lines.join('\n'),
            uri: vscode.Uri.file('/mock.cif'),
            fileName: '/mock.cif',
            isUntitled: false,
            languageId: 'mmcif',
            version: 1,
            isDirty: false,
            save: () => Promise.resolve(true),
            eol: vscode.EndOfLine.LF,
            positionAt: (offset: number) => new vscode.Position(0, 0),
            offsetAt: (position: vscode.Position) => 0,
            validateRange: (range: vscode.Range) => range,
            validatePosition: (position: vscode.Position) => position,
            getWordRangeAtPosition: (position: vscode.Position) => undefined,
        } as unknown as vscode.TextDocument;
    }

    // --- Non-loop grouping (the main improvement) ---

    test('Groups consecutive same-category non-loop items into one block', () => {
        const lines = [
            'data_TEST',
            '_entry.id   TEST',
            '_entry.desc "Test Entry"'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        // Both _entry items should be grouped into ONE block
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].categoryName, '_entry');
        assert.strictEqual(blocks[0].fieldNames.length, 2);
        assert.strictEqual(blocks[0].fieldNames[0].fieldName, 'id');
        assert.strictEqual(blocks[0].fieldNames[1].fieldName, 'desc');

        // Each pair should have a data row with correct columnIndex
        const idRow = blocks[0].dataRows.find(r => r.line === 1);
        assert.ok(idRow, 'Should have data row for _entry.id');
        assert.strictEqual(idRow!.valueRanges[0].columnIndex, 0);
        assert.strictEqual(idRow!.valueRanges[0].length, 4); // "TEST"

        const descRow = blocks[0].dataRows.find(r => r.line === 2);
        assert.ok(descRow, 'Should have data row for _entry.desc');
        assert.strictEqual(descRow!.valueRanges[0].columnIndex, 1);
    });

    test('Three consecutive same-category items produce one block with 3 columns', () => {
        const lines = [
            'data_TEST',
            '_entry.id     1',
            '_entry.title  "My Title"',
            '_entry.desc   "Description"'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].fieldNames.length, 3);
        assert.strictEqual(blocks[0].fieldNames[0].fieldName, 'id');
        assert.strictEqual(blocks[0].fieldNames[1].fieldName, 'title');
        assert.strictEqual(blocks[0].fieldNames[2].fieldName, 'desc');
    });

    test('Mixed categories produce separate blocks', () => {
        const lines = [
            'data_TEST',
            '_entry.id TEST',
            '_cell.length_a 10.0'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 2);
        assert.strictEqual(blocks[0].categoryName, '_entry');
        assert.strictEqual(blocks[1].categoryName, '_cell');
    });

    test('Category interrupted then resumed produces 3 blocks', () => {
        const lines = [
            'data_TEST',
            '_entry.id   X',
            '_cell.a     1',
            '_entry.desc Y'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 3);
        assert.strictEqual(blocks[0].categoryName, '_entry');
        assert.strictEqual(blocks[0].fieldNames[0].fieldName, 'id');
        assert.strictEqual(blocks[1].categoryName, '_cell');
        assert.strictEqual(blocks[2].categoryName, '_entry');
        assert.strictEqual(blocks[2].fieldNames[0].fieldName, 'desc');
    });

    // --- Loop blocks ---

    test('Parses loop_ block correctly', () => {
        const lines = [
            'data_TEST',
            'loop_',
            '_atom_site.id',
            '_atom_site.label_atom_id',
            '1 N',
            '2 CA',
            '3 C'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        const block = blocks[0];
        assert.strictEqual(block.categoryName, '_atom_site');
        assert.strictEqual(block.fieldNames.length, 2);
        assert.strictEqual(block.dataRows.length, 3);

        // Check first data row column indices
        assert.strictEqual(block.dataRows[0].valueRanges.length, 2);
        assert.strictEqual(block.dataRows[0].valueRanges[0].columnIndex, 0); // 1 -> id
        assert.strictEqual(block.dataRows[0].valueRanges[1].columnIndex, 1); // N -> label_atom_id
    });

    // --- Multi-line strings ---

    test('Parses multi-line strings correctly', () => {
        const lines = [
            'loop_',
            '_entity_poly.pdbx_seq_one_letter_code',
            ';VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNAL',
            'SALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR',
            ';'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        const block = blocks[0];

        assert.ok(block.dataRows.find(d => d.line === 2), 'Opening semi-colon line should be in dataRows');
        assert.ok(block.dataRows.find(d => d.line === 3), 'Content line should be in dataRows');
        assert.ok(block.dataRows.find(d => d.line === 4), 'Closing semi-colon line should be in dataRows');
    });

    test('Non-loop multi-line string gets correct columnIndex', () => {
        const lines = [
            'data_TEST',
            '_entity.description',
            ';This is a long',
            'multi-line description',
            ';'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].fieldNames[0].fieldName, 'description');

        // All multi-line data rows should have columnIndex 0
        for (const row of blocks[0].dataRows) {
            for (const vr of row.valueRanges) {
                assert.strictEqual(vr.columnIndex, 0, `Line ${row.line} should have columnIndex 0`);
            }
        }
    });

    // --- Quoted strings ---

    test('Handles quoted strings correctly', () => {
        const lines = [
            'loop_',
            '_test.a',
            '_test.b',
            "'Value A' \"Value B with spaces\""
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        const block = blocks[0];
        assert.strictEqual(block.dataRows.length, 1);
        const ranges = block.dataRows[0].valueRanges;
        assert.strictEqual(ranges.length, 2);
        assert.strictEqual(ranges[0].length, 9);  // 'Value A'
        assert.strictEqual(ranges[1].length, 21); // "Value B with spaces"
    });

    // --- Comments ---

    test('Ignores comments', () => {
        const lines = [
            '# This is a comment',
            'data_TEST',
            '# Another comment',
            '_item.value 1'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].dataRows.length, 1);
    });

    // --- Edge cases ---

    test('Handles empty file gracefully', () => {
        const lines: string[] = [];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.strictEqual(blocks.length, 0);
    });

    test('Handles file with only comments', () => {
        const lines = ['# Comment line 1', '# Comment line 2', '# Comment line 3'];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.strictEqual(blocks.length, 0);
    });

    test('Handles file with only whitespace', () => {
        const lines = ['', '   ', '\t', ''];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.strictEqual(blocks.length, 0);
    });

    test('Handles loop_ with no field names', () => {
        const lines = [
            'data_TEST',
            'loop_',
            'data_NEXT'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.ok(blocks.length >= 0);
    });

    test('Handles unclosed multi-line string', () => {
        const lines = [
            'data_TEST',
            '_item.value',
            ';This is a multi-line string',
            'that never closes'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.ok(blocks.length >= 0);
    });

    test('Handles malformed category name', () => {
        const lines = [
            'data_TEST',
            '_invalid 1'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.ok(blocks.length >= 0);
    });

    test('Handles very long lines', () => {
        const longValue = 'A'.repeat(10000);
        const lines = [
            'data_TEST',
            `_item.value ${longValue}`
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);

        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].dataRows[0].valueRanges[0].length, 10000);
    });

    test('Handles special characters in values', () => {
        const lines = [
            'data_TEST',
            '_item.value "Value with special chars: <>&\'\""'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.strictEqual(blocks.length, 1);
    });

    test('Handles save_ blocks', () => {
        const lines = [
            'data_TEST',
            'save_FRAME',
            '_item.value 1',
            'save_'
        ];
        const doc = createMockDocument(lines);
        const blocks = parser.parseBlocks(doc);
        assert.ok(blocks.length >= 0);
    });
});
