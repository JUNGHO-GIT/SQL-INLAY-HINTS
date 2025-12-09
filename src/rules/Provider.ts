/**
 * @file Provider.ts
 * @description SQL INSERT InlayHints Provider
 * @author Jungho
 * @since 2025-12-8
 */

import { vscode } from "@exportLibs";
import type { ParsedInsert } from "@exportTypes";
import { findInsertValues, findInsertSelect, isValidInsert, isValidInsertSelect } from "@exportRules";

// -------------------------------------------------------------------------------------------------
class SqlInsertInlayHintsProvider implements vscode.InlayHintsProvider {
	// 1. InlayHints 제공 메인 함수 ----------------------------------------------------------------
	async provideInlayHints(
		document: vscode.TextDocument,
		_range: vscode.Range,
		token: vscode.CancellationToken
	): Promise<vscode.InlayHint[]> {
		const text = document.getText();
		const hints: vscode.InlayHint[] = [];

		// INSERT INTO ... VALUES 처리
		for (const parsed of findInsertValues(text)) {
			if (token.isCancellationRequested) {
				return hints;
			}
			isValidInsert(parsed) && this.createHintsForValues(document, parsed, hints);
		}

		// INSERT INTO ... SELECT 처리
		for (const parsed of findInsertSelect(text)) {
			if (token.isCancellationRequested) {
				return hints;
			}
			isValidInsertSelect(parsed) && this.createHintsForSelect(document, parsed, hints);
		}

		return hints;
	}

	// 2. VALUES 구문 힌트 생성 -------------------------------------------------------------------
	private createHintsForValues(
		document: vscode.TextDocument,
		parsed: ParsedInsert,
		hints: vscode.InlayHint[]
	): void {
		parsed.valueRows.forEach((row) => {
			parsed.columns.forEach((column, i) => {
				const valuePos = row.valuePositions[i];
				if (valuePos < 0) {
					return;
				}
				const position = document.positionAt(valuePos);
				const hint = new vscode.InlayHint(
					position, `${column}: `, vscode.InlayHintKind.Parameter
				);
				hint.paddingRight = true;
				hints.push(hint);
			});
		});
	}

	// 3. SELECT 구문 힌트 생성 -------------------------------------------------------------------
	private createHintsForSelect(
		document: vscode.TextDocument,
		parsed: ParsedInsert,
		hints: vscode.InlayHint[]
	): void {
		parsed.valueRows.forEach((row, i) => {
			const valuePos = row.valuePositions[0];
			if (valuePos < 0) {
				return;
			}
			const position = document.positionAt(valuePos);
			const hint = new vscode.InlayHint(
				position, `${parsed.columns[i]}: `, vscode.InlayHintKind.Parameter
			);
			hint.paddingRight = true;
			hints.push(hint);
		});
	}
}

// 4. 설정값 조회 --------------------------------------------------------------------------------
const getConfig = <T>(key: string, defaultValue: T): T => {
	const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`);
	const rs = config.get<T>(key, defaultValue);
	return rs;
};

// 5. SQL 파일 Provider 등록 ---------------------------------------------------------------------
const registerSqlProvider = (provider: SqlInsertInlayHintsProvider): vscode.Disposable => {
	const rs = vscode.languages.registerInlayHintsProvider(
		{
			"scheme": `file`,
			"language": `sql`,
		},
		provider
	);
	return rs;
};

// 6. MyBatis XML Provider 등록 ------------------------------------------------------------------
const registerXmlProvider = (provider: SqlInsertInlayHintsProvider): vscode.Disposable => {
	const rs = vscode.languages.registerInlayHintsProvider(
		{
			"scheme": `file`,
			"language": `xml`,
		},
		provider
	);
	return rs;
};

// 7. InlayHints Provider 등록 (메인) ------------------------------------------------------------
export const createInlayHintsProvider = (): vscode.Disposable[] => {
	const provider = new SqlInsertInlayHintsProvider();
	const disposables: vscode.Disposable[] = [];

	// SQL 파일 옵션 확인 후 등록
	const enableSql = getConfig<boolean>(`enableSql`, true);
	enableSql && disposables.push(registerSqlProvider(provider));

	// MyBatis XML 옵션 확인 후 등록
	const enableXml = getConfig<boolean>(`enableXml`, true);
	enableXml && disposables.push(registerXmlProvider(provider));

	return disposables;
};
