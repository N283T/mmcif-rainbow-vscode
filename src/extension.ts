import * as vscode from "vscode";
import { MmCifTokenProvider, tokensLegend } from "./tokenProvider";
import { MmCifHoverProvider } from "./hoverProvider";
import { CursorHighlighter } from "./cursorHighlighter";
import { PlddtColorizer } from "./plddtColorizer";
import { DictionaryManager } from "./dictionary";
import { SearchProvider } from "./searchProvider";
import { LoopCache } from "./loopCache";
import { Logger } from "./logger";
import { debounce } from "./utils";
import { CURSOR_UPDATE_DEBOUNCE_MS, PLDDT_UPDATE_DELAY_MS } from "./constants";

export function activate(context: vscode.ExtensionContext) {
  const provider = new MmCifTokenProvider();
  const selector: vscode.DocumentSelector = {
    language: "mmcif",
    scheme: "file"
  };

  // Initialize Logger
  const logger = Logger.getInstance();
  context.subscriptions.push(logger.getOutputChannel());

  // Initialize Dictionary Manager
  const dictManager = DictionaryManager.getInstance();
  dictManager.setExtensionUri(context.extensionUri);
  dictManager.loadDictionary(context.extensionUri);

  // Initialize disposable providers and register them
  const cursorHighlighter = CursorHighlighter.getInstance();
  const plddtColorizer = PlddtColorizer.getInstance();
  const searchProvider = new SearchProvider();

  // Register disposables
  context.subscriptions.push(cursorHighlighter);
  context.subscriptions.push(plddtColorizer);
  context.subscriptions.push(searchProvider);

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

  // Register cursor change listener for column highlighting (debounced to avoid excessive updates)
  const debouncedCursorUpdate = debounce((editor: vscode.TextEditor) => {
    cursorHighlighter.updateEditor(editor);
  }, CURSOR_UPDATE_DEBOUNCE_MS);

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      debouncedCursorUpdate(event.textEditor);
    })
  );

  // Update on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      cursorHighlighter.updateEditor(editor);
      plddtColorizer.updateEditor(editor);
    })
  );

  // Update pLDDT coloring when document content changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        setTimeout(() => plddtColorizer.updateEditor(editor), PLDDT_UPDATE_DELAY_MS);
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

  // Clean up LoopCache when document is closed to prevent memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      LoopCache.delete(document.uri);
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
    plddtColorizer.updateEditor(vscode.window.activeTextEditor);
  }
}

export function deactivate() {
  // Disposables registered to context.subscriptions are automatically disposed
}
