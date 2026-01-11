import * as vscode from "vscode";
import { MmCifTokenProvider, tokensLegend } from "./tokenProvider";
import { MmCifHoverProvider } from "./hoverProvider";
import { CursorHighlighter } from "./cursorHighlighter";
import { PlddtColorizer } from "./plddtColorizer";
import { DictionaryManager } from "./dictionary";
import { SearchProvider } from "./searchProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new MmCifTokenProvider();
  const selector: vscode.DocumentSelector = {
    language: "mmcif",
    scheme: "file"
  };

  // Initialize Dictionary Manager
  const dictManager = DictionaryManager.getInstance();
  dictManager.setExtensionUri(context.extensionUri);
  dictManager.loadDictionary(context.extensionUri);

  // Initialize Search Provider
  const searchProvider = new SearchProvider();

  // Register semantic tokens provider
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      provider,
      tokensLegend
    )
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new MmCifHoverProvider(dictManager))
  );

  // Register search command
  context.subscriptions.push(
    vscode.commands.registerCommand("mmcif-rainbow.search", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        searchProvider.showSearch(editor);
      }
    })
  );

  // Register cursor change listener for column highlighting
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      CursorHighlighter.update(event.textEditor);
    })
  );

  // Update on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      CursorHighlighter.update(editor);
      PlddtColorizer.update(editor);
    })
  );

  // Update pLDDT coloring when document content changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        setTimeout(() => PlddtColorizer.update(editor), 100);
      }
    })
  );

  // Detect dictionary type when mmCIF document is opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.languageId === 'mmcif') {
        dictManager.setDocumentDictionary(document);
      }
    })
  );

  // Check currently open documents
  vscode.workspace.textDocuments.forEach(document => {
    if (document.languageId === 'mmcif') {
      dictManager.setDocumentDictionary(document);
    }
  });

  // Apply pLDDT coloring to currently active editor
  if (vscode.window.activeTextEditor) {
    PlddtColorizer.update(vscode.window.activeTextEditor);
  }
}

export function deactivate() { }
