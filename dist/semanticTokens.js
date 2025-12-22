"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSemanticTokens = registerSemanticTokens;
const vscode = __importStar(require("vscode"));
const loopTokenizer_1 = require("./loopTokenizer");
const legend = new vscode.SemanticTokensLegend([
    "cifCategory",
    "cifColumn1",
    "cifColumn2",
    "cifColumn3",
    "cifColumn4",
    "cifColumn5",
    "cifColumn6",
    "cifColumn7",
    "cifColumn8"
], []);
function registerSemanticTokens(context) {
    const provider = {
        provideDocumentSemanticTokens(document) {
            const builder = new vscode.SemanticTokensBuilder(legend);
            const tokens = (0, loopTokenizer_1.collectColumnTokens)(document);
            for (const token of tokens) {
                const typeIndex = token.kind === "category"
                    ? 0
                    : columnTypeIndex(token.columnIndex ?? 0);
                builder.push(token.line, token.start, token.length, typeIndex, 0 // no modifiers
                );
            }
            return builder.build();
        }
    };
    const selector = [
        { language: "mmcif", scheme: "file" },
        { pattern: "**/*.{cif,mmcif}" }
    ];
    const disposable = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, legend);
    context.subscriptions.push(disposable);
}
function columnTypeIndex(index) {
    const capped = Math.max(0, Math.min(index, legend.tokenTypes.length - 2));
    return 1 + capped; // shift because 0 is category
}
//# sourceMappingURL=semanticTokens.js.map