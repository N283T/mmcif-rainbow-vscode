import * as vscode from "vscode";

export type TokenKind = "category" | "column";

export interface ColumnToken {
  line: number;
  start: number;
  length: number;
  kind: TokenKind;
  columnIndex?: number; // zero-based, only for kind === "column"
}

export function collectColumnTokens(document: vscode.TextDocument): ColumnToken[] {
  const results: ColumnToken[] = [];
  const lineCount = document.lineCount;

  let line = 0;
  while (line < lineCount) {
    const raw = document.lineAt(line).text;
    if (raw.trim() !== "loop_") {
      line++;
      continue;
    }

    const headers: string[] = [];
    let cursor = line + 1;

    // ---------- ヘッダ行を収集 ----------
    while (cursor < lineCount) {
      const text = document.lineAt(cursor).text;
      const trimmed = text.trim();
      if (!trimmed.startsWith("_")) break;

      const headerIndex = headers.length;
      const match = /(_[^.\s]+)\.(\S+)/.exec(text);
      if (match) {
        // category 部分
        results.push({
          line: cursor,
          start: match.index,
          length: match[1].length,
          kind: "category"
        });
        // フィールド名部分
        results.push({
          line: cursor,
          start: match.index + match[1].length + 1, // dot を飛ばす
          length: match[2].length,
          kind: "column",
          columnIndex: headerIndex
        });
      }

      headers.push(trimmed);
      cursor++;
    }

    if (headers.length === 0) {
      line = cursor;
      continue;
    }

    // ---------- データ行を収集 ----------
    while (cursor < lineCount) {
      const text = document.lineAt(cursor).text;
      const trimmed = text.trim();

      if (
        trimmed === "" ||
        trimmed.startsWith("loop_") ||
        trimmed.startsWith("data_") ||
        trimmed.startsWith("save_") ||
        trimmed.startsWith("_")
      ) {
        break;
      }

      const values = tokenizeDataLine(text);
      const max = Math.min(headers.length, values.length);
      for (let i = 0; i < max; i++) {
        const token = values[i];
        results.push({
          line: cursor,
          start: token.start,
          length: token.length,
          kind: "column",
          columnIndex: i
        });
      }

      cursor++;
    }

    line = cursor; // 次の loop_ を探しに進む
  }

  return results;
}

interface ValueToken {
  start: number;
  length: number;
}

function tokenizeDataLine(line: string): ValueToken[] {
  const tokens: ValueToken[] = [];
  const regex = /'[^']*'|"[^"]*"|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    tokens.push({
      start: match.index,
      length: match[0].length
    });
  }
  return tokens;
}


