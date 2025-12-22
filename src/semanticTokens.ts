import * as vscode from "vscode";
import { collectColumnTokens } from "./loopTokenizer";

const legend = new vscode.SemanticTokensLegend(
  [
    "cifCategory",
    "cifColumn1",
    "cifColumn2",
    "cifColumn3",
    "cifColumn4",
    "cifColumn5",
    "cifColumn6",
    "cifColumn7",
    "cifColumn8"
  ],
  []
);

export function registerSemanticTokens(context: vscode.ExtensionContext) {
  const provider: vscode.DocumentSemanticTokensProvider = {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(legend);
      const tokens = collectColumnTokens(document);

      for (const token of tokens) {
        const typeIndex =
          token.kind === "category"
            ? 0
            : columnTypeIndex(token.columnIndex ?? 0);
        builder.push(
          token.line,
          token.start,
          token.length,
          typeIndex,
          0 // no modifiers
        );
      }

      return builder.build();
    }
  };

  const selector: vscode.DocumentSelector = [
    { language: "mmcif", scheme: "file" },
    { pattern: "**/*.{cif,mmcif}" }
  ];
  const disposable = vscode.languages.registerDocumentSemanticTokensProvider(
    selector,
    provider,
    legend
  );

  context.subscriptions.push(disposable);
}

function columnTypeIndex(index: number): number {
  const capped = Math.max(0, Math.min(index, legend.tokenTypes.length - 2));
  return 1 + capped; // shift because 0 is category
}


