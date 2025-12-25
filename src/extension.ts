import * as vscode from "vscode";
import { MmCifTokenProvider, MmCifHoverProvider, CursorHighlighter, tokensLegend } from "./features";

export function activate(context: vscode.ExtensionContext) {
  const provider = new MmCifTokenProvider();
  const selector: vscode.DocumentSelector = {
    language: "mmcif",
    scheme: "file"
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      provider,
      tokensLegend
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new MmCifHoverProvider())
  );

  // Register cursor change listener
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      CursorHighlighter.update(event.textEditor);
    })
  );

  // Update on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      CursorHighlighter.update(editor);
    })
  );
}

export function deactivate() { }
