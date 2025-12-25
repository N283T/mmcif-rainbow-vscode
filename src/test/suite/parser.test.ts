import * as assert from 'assert';
import * as vscode from 'vscode';
import { CifParser, LoopBlock } from '../../parser';

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

    test('Parses single item data correctly', () => {
        const lines = [
            'data_TEST',
            '_entry.id   TEST',
            '_entry.desc "Test Entry"'
        ];
        const doc = createMockDocument(lines);
        const loops = parser.parseLoops(doc);

        assert.strictEqual(loops.length, 2);
        assert.strictEqual(loops[0].categoryName, '_entry');
        assert.strictEqual(loops[0].fieldNames[0].fieldName, 'id');
        assert.strictEqual(loops[0].dataLines[0].valueRanges[0].length, 4); // "TEST"

        assert.strictEqual(loops[1].categoryName, '_entry');
        assert.strictEqual(loops[1].fieldNames[0].fieldName, 'desc');
    });

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
        const loops = parser.parseLoops(doc);

        assert.strictEqual(loops.length, 1);
        const loop = loops[0];
        assert.strictEqual(loop.isInLoopBlock, true);
        assert.strictEqual(loop.categoryName, '_atom_site');
        assert.strictEqual(loop.fieldNames.length, 2);
        assert.strictEqual(loop.dataLines.length, 3);

        // Check first data line keys
        assert.strictEqual(loop.dataLines[0].valueRanges.length, 2);
        assert.strictEqual(loop.dataLines[0].valueRanges[0].columnIndex, 0); // 1 -> id
        assert.strictEqual(loop.dataLines[0].valueRanges[1].columnIndex, 1); // N -> label_atom_id
    });

    test('Parses multi-line strings correctly', () => {
        // Reproduce the user's case
        const lines = [
            'loop_',
            '_entity_poly.pdbx_seq_one_letter_code',
            ';VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNAL',
            'SALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR',
            ';'
        ];
        const doc = createMockDocument(lines);
        const loops = parser.parseLoops(doc);

        assert.strictEqual(loops.length, 1);
        const loop = loops[0];

        // Multi-line string should generate data lines
        // Line 2: ;VLSP...
        // Line 3: SALSD...
        // Line 4: ;
        // All of these should be in dataLines now
        assert.ok(loop.dataLines.find(d => d.line === 2), 'Opening semi-colon line should be in dataLines');
        assert.ok(loop.dataLines.find(d => d.line === 3), 'Content line should be in dataLines');
        assert.ok(loop.dataLines.find(d => d.line === 4), 'Closing semi-colon line should be in dataLines');
    });

    test('Handles quoted strings correctly', () => {
        const lines = [
            'loop_',
            '_test.a',
            '_test.b',
            "'Value A' \"Value B with spaces\""
        ];
        const doc = createMockDocument(lines);
        const loops = parser.parseLoops(doc);

        assert.strictEqual(loops.length, 1);
        const loop = loops[0];
        assert.strictEqual(loop.dataLines.length, 1);
        const ranges = loop.dataLines[0].valueRanges;
        assert.strictEqual(ranges.length, 2);

        // Check lengths (quotes are part of the token usually in our parser split, let's verify)
        // specialSplit preserves quotes? 
        // output[olast][0] += char; -> yes it adds quotes to token.
        // ranges are indices into lineText.

        // 'Value A' length 9
        // "Value B with spaces" length 21
        assert.strictEqual(ranges[0].length, 9);
        assert.strictEqual(ranges[1].length, 21);
    });

    test('Ignores comments', () => {
        const lines = [
            '# This is a comment',
            'data_TEST',
            '# Another comment',
            '_item.value 1'
        ];
        const doc = createMockDocument(lines);
        const loops = parser.parseLoops(doc);

        assert.strictEqual(loops.length, 1);
        assert.strictEqual(loops[0].dataLines.length, 1);
    });
});
