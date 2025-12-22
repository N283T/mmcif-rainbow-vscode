import * as vscode from "vscode";
import { registerSemanticTokens } from "./semanticTokens";

export function activate(context: vscode.ExtensionContext) {
  const hello = vscode.commands.registerCommand(
    "mmcif-rainbow.helloWorld",
    () => {
      vscode.window.showInformationMessage("mmCIF Rainbow: Hello World!");
    }
  );

  registerSemanticTokens(context);
  context.subscriptions.push(hello);
}

export function deactivate() {
  // clean up if needed in the future
}


