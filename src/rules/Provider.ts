/**
 * @file Provider.ts
 * @description SQL INSERT InlayHints Provider
 * @author Jungho
 * @since 2025-12-8
 */

import { vscode } from "@exportLibs";
import { findInsertSelect as fndInsrSlct, findInsertValues as fndInsrVals, findReplaceValues as fndRplcVals, findUpdateStatements as fndUpdtSttm, isValidInsert as isVldInsr, isValidInsertSelect as isVlInSl } from "@exportRules";
import type { ParsedInsert } from "@exportTypes";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
interface ProviderCache {
  hints: vscode.InlayHint[];
  maxDocumentLength: number;
  uri: string;
  version: number;
}

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
class SqlInsertInlayHintsProvider implements vscode.InlayHintsProvider {
  private cache: ProviderCache | undefined;
  private readonly chngEmt = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.chngEmt.event;

  // 0. 설정 변경 시 힌트 갱신 요청 ――――――――――――――――――――――――――――――――――――-
  refresh(): void {
    this.cache = undefined;
    this.chngEmt.fire();
  }

  // 1. InlayHints 제공 메인 함수 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  async provideInlayHints(document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[]> {
    const uri = document.uri.toString();
    const mxDocLen = Math.max(0, getConfig<number>(`maxDocumentLength`, 300_000));
    const docLen = this.getDocumentLength(document);
    const cacheHit = this.cache?.uri === uri && this.cache.version === document.version && this.cache.maxDocumentLength === mxDocLen;
    const shouldParse = !token.isCancellationRequested && (mxDocLen === 0 || docLen <= mxDocLen);
    let hints: vscode.InlayHint[] = [];

    if (shouldParse) {
      const sourceHints = cacheHit && this.cache ? this.cache.hints : this.createHintsForDocument(document, token);
      if (!token.isCancellationRequested) {
        if (!cacheHit) {
          this.cache = {
            hints: sourceHints,
            maxDocumentLength: mxDocLen,
            uri: uri,
            version: document.version,
          };
        }
        hints = sourceHints.filter((hint) => range.contains(hint.position));
      }
    }
    return hints;
  }

  // 2. 문서 길이 계산 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  private getDocumentLength(document: vscode.TextDocument): number {
    const lastLine = document.lineAt(document.lineCount - 1);
    const rs = document.offsetAt(lastLine.range.end);
    return rs;
  }

  // 3. 문서 단위 힌트 생성 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  private createHintsForDocument(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.InlayHint[] {
    const text = document.getText();
    const hints: vscode.InlayHint[] = [];

    // INSERT INTO ... VALUES 처리
    for (const parsed of fndInsrVals(text)) {
      if (token.isCancellationRequested) {
      	return hints;
      }
      isVldInsr(parsed) && this.createHintsForValues(document, parsed, hints);
    }
    // INSERT INTO ... SELECT 처리
    for (const parsed of fndInsrSlct(text)) {
      if (token.isCancellationRequested) {
      	return hints;
      }
      isVlInSl(parsed) && this.createHintsForSelect(document, parsed, hints);
    }
    // UPDATE ... SET 처리
    for (const parsed of fndUpdtSttm(text)) {
      if (token.isCancellationRequested) {
      	return hints;
      }
      parsed.valueRows.length > 0 && this.createHintsForUpdate(document, parsed, hints);
    }
    // REPLACE INTO ... VALUES 처리
    for (const parsed of fndRplcVals(text)) {
      if (token.isCancellationRequested) {
      	return hints;
      }
      isVldInsr(parsed) && this.createHintsForValues(document, parsed, hints);
    }
    return hints;
  }
  // 2. VALUES 구문 힌트 생성 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  private createHintsForValues(document: vscode.TextDocument, parsed: ParsedInsert, hints: vscode.InlayHint[]): void {
    parsed.valueRows.forEach((row) => {
      parsed.columns.forEach((column, i) => {
        const valuePos = row.valuePositions[i];
        if (valuePos < 0) {
        	return;
        }
        const position = document.positionAt(valuePos);
        const hint = new vscode.InlayHint(position, `${column}: `, vscode.InlayHintKind.Parameter);
        hint.paddingRight = true;
        hints.push(hint);
      });
    });
  }
  // 3. SELECT 구문 힌트 생성 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  private createHintsForSelect(document: vscode.TextDocument, parsed: ParsedInsert, hints: vscode.InlayHint[]): void {
    parsed.valueRows.forEach((row, i) => {
      const valuePos = row.valuePositions[0];
      if (valuePos < 0) {
      	return;
      }
      const position = document.positionAt(valuePos);
      const hint = new vscode.InlayHint(position, `${parsed.columns[i]}: `, vscode.InlayHintKind.Parameter);
      hint.paddingRight = true;
      hints.push(hint);
    });
  }
  // 4. UPDATE SET 구문 힌트 생성 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  private createHintsForUpdate(document: vscode.TextDocument, parsed: ParsedInsert, hints: vscode.InlayHint[]): void {
    parsed.valueRows.forEach((row, i) => {
      const valuePos = row.valuePositions[0];
      if (valuePos < 0) {
      	return;
      }
      const position = document.positionAt(valuePos);
      const hint = new vscode.InlayHint(position, `${parsed.columns[i]} = `, vscode.InlayHintKind.Parameter);
      hint.paddingRight = true;
      hints.push(hint);
    });
  }
}
// 4. 설정값 조회 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const getConfig = <T>(key: string, defaultValue: T): T => {
  const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`);
  const rs = config.get<T>(key, defaultValue);
  return rs;
};

// 5. SQL 파일 Provider 등록 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const rgstSqlProv = (provider: SqlInsertInlayHintsProvider): vscode.Disposable => {
  const rs = vscode.languages.registerInlayHintsProvider(
    {
      language: `sql`,
    },
    provider,
  );
  return rs;
};

// 6. MyBatis XML Provider 등록 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const rgstXmlProv = (provider: SqlInsertInlayHintsProvider): vscode.Disposable => {
  const rs = vscode.languages.registerInlayHintsProvider(
    {
      language: `xml`,
    },
    provider,
  );
  return rs;
};

// 7. InlayHints Provider 등록 (메인) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const crtInHnPr = (): vscode.Disposable[] => {
  const provider = new SqlInsertInlayHintsProvider();
  const disposables: vscode.Disposable[] = [];

  // SQL 파일 옵션 확인 후 등록
  const enableSql = getConfig<boolean>(`enableSql`, true);
  enableSql && disposables.push(rgstSqlProv(provider));

  // MyBatis XML 옵션 확인 후 등록
  const enableXml = getConfig<boolean>(`enableXml`, true);
  enableXml && disposables.push(rgstXmlProv(provider));

  // 설정 변경 시 힌트 재계산 트리거
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`SQL-Inlay-Hints`)) {
        provider.refresh();
      }
    }),
  );

  return disposables;
};
