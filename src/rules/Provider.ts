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
	// ---------------------------------------------------------------------------------------------
	async provideInlayHints(
		document: vscode.TextDocument,
		range: vscode.Range,
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

	// ---------------------------------------------------------------------------------------------
	private createHintsForValues(
		document: vscode.TextDocument,
		parsed: ParsedInsert,
		hints: vscode.InlayHint[]
	): void {
		const text = document.getText();

		for (const row of parsed.valueRows) {
			let searchPos = row.position;

			for (let i = 0; i < parsed.columns.length; i++) {
				const value = row.values[i].trim();
				const valuePos = text.indexOf(value, searchPos);

				if (valuePos !== -1) {
					const position = document.positionAt(valuePos);
					const hint = new vscode.InlayHint(
						position,
						`${parsed.columns[i]}: `,
						vscode.InlayHintKind.Parameter
					);
					hint.paddingRight = true;
					hints.push(hint);
					searchPos = valuePos + value.length;
				}
			}
		}
	}

	// ---------------------------------------------------------------------------------------------
	private createHintsForSelect(
		document: vscode.TextDocument,
		parsed: ParsedInsert,
		hints: vscode.InlayHint[]
	): void {
		for (let i = 0; i < parsed.valueRows.length; i++) {
			const row = parsed.valueRows[i];
			const position = document.positionAt(row.position);
			const hint = new vscode.InlayHint(
				position,
				`${parsed.columns[i]}: `,
				vscode.InlayHintKind.Parameter
			);
			hint.paddingRight = true;
			hints.push(hint);
		}
	}
}

// -------------------------------------------------------------------------------------------------
export const createInlayHintsProvider = (): vscode.Disposable => {
	const provider = new SqlInsertInlayHintsProvider();
	const rs = vscode.languages.registerInlayHintsProvider(
		{
			"scheme": `file`,
			"language": `sql`,
		},
		provider
	);
	return rs;
};
