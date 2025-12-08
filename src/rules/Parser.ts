/**
 * @file Parser.ts
 * @description SQL INSERT 문 파싱 로직
 * @author Jungho
 * @since 2025-12-8
 */

import type { ParsedInsert, ValueRow } from "@exportTypes";

// -------------------------------------------------------------------------------------------------
// INSERT INTO ... VALUES 패턴 (스키마.테이블 지원)
const INSERT_VALUES_REGEX = /INSERT\s+INTO\s+["`]?[\w.]+["`]?\s*\((.*?)\)\s*VALUES\s*/gis;

// INSERT INTO ... SELECT 패턴 (스키마.테이블 지원)
const INSERT_SELECT_REGEX = /INSERT\s+INTO\s+["`]?[\w.]+["`]?\s*\((.*?)\)\s*SELECT\s+([\s\S]+?)(?:FROM|;|$)/gi;

// -------------------------------------------------------------------------------------------------
export const parseColumns = (columnsStr: string): string[] => {
	const rs = columnsStr
		.split(`,`)
		.map((col) => col.trim().replace(/^["`]|["`]$/g, ``));
	return rs;
};

// -------------------------------------------------------------------------------------------------
export const parseRowValues = (rowStr: string): string[] => {
	const values: string[] = [];
	let current = ``;
	let inString = false;
	let stringChar = ``;
	let parenDepth = 0;

	for (let i = 0; i < rowStr.length; i++) {
		const char = rowStr[i];
		const prevChar = i > 0 ? rowStr[i - 1] : ``;
		const isEscaped = prevChar === `\\` || (inString && stringChar === char && rowStr[i + 1] === char);

		// 이스케이프된 따옴표 처리 ('' 또는 "")
		if (inString && char === stringChar && rowStr[i + 1] === char) {
			current += char + rowStr[i + 1];
			i++;
			continue;
		}

		const isStringStart = (char === `'` || char === `"`) && !inString;
		const isStringEnd = inString && char === stringChar && !isEscaped;
		const isComma = char === `,` && !inString && parenDepth === 0;

		if (isComma) {
			values.push(current.trim());
			current = ``;
		}
		else if (isStringStart) {
			inString = true;
			stringChar = char;
			current += char;
		}
		else if (isStringEnd) {
			inString = false;
			stringChar = ``;
			current += char;
		}
		else {
			!inString && char === `(` && parenDepth++;
			!inString && char === `)` && parenDepth--;
			current += char;
		}
	}
	current.trim() && values.push(current.trim());

	return values;
};

// -------------------------------------------------------------------------------------------------
export const parseSelectColumns = (selectStr: string): string[] => {
	const values: string[] = [];
	let current = ``;
	let inString = false;
	let stringChar = ``;
	let parenDepth = 0;

	const cleaned = selectStr.trim().replace(/\s+/g, ` `);

	for (const char of cleaned) {
		const isStringDelim = (char === `'` || char === `"`) && !inString;
		const isStringEnd = inString && char === stringChar;
		const isComma = char === `,` && !inString && parenDepth === 0;

		if (isComma) {
			values.push(current.trim());
			current = ``;
		}
		else if (isStringDelim) {
			inString = true;
			stringChar = char;
			current += char;
		}
		else if (isStringEnd) {
			inString = false;
			stringChar = ``;
			current += char;
		}
		else {
			!inString && char === `(` && parenDepth++;
			!inString && char === `)` && parenDepth--;
			current += char;
		}
	}
	current.trim() && values.push(current.trim());

	return values;
};

// -------------------------------------------------------------------------------------------------
export const extractAlias = (expr: string): string | null => {
	const trimmed = expr.trim();
	// AS alias 패턴
	const asMatch = trimmed.match(/\s+AS\s+["`]?(\w+)["`]?\s*$/i);
	if (asMatch) {
		return asMatch[1];
	}
	// 공백으로 구분된 별칭 (AS 없이)
	const spaceMatch = trimmed.match(/\s+["`]?(\w+)["`]?\s*$/);
	if (spaceMatch && !trimmed.match(/\s+(AND|OR|FROM|WHERE|JOIN|ON|GROUP|ORDER|HAVING|LIMIT|UNION)\s*$/i)) {
		return spaceMatch[1];
	}
	return null;
};

// -------------------------------------------------------------------------------------------------
const parseValuesBlock = (text: string, startPos: number): ValueRow[] => {
	const valueRows: ValueRow[] = [];
	let pos = startPos;
	let inString = false;
	let stringChar = ``;
	let parenDepth = 0;
	let currentRowStart = -1;

	while (pos < text.length) {
		const char = text[pos];
		const prevChar = pos > 0 ? text[pos - 1] : ``;

		// 문자열 시작/종료 처리
		if ((char === `'` || char === `"`) && prevChar !== `\\`) {
			if (!inString) {
				inString = true;
				stringChar = char;
			}
			else if (char === stringChar) {
				inString = false;
				stringChar = ``;
			}
		}

		if (!inString) {
			if (char === `(`) {
				parenDepth === 0 && (currentRowStart = pos);
				parenDepth++;
			}
			else if (char === `)`) {
				parenDepth--;
				if (parenDepth === 0 && currentRowStart !== -1) {
					const rowContent = text.substring(currentRowStart + 1, pos);
					valueRows.push({
						"values": parseRowValues(rowContent),
						"position": currentRowStart + 1,
					});
					currentRowStart = -1;
				}
			}
			// INSERT 또는 세미콜론을 만나면 현재 VALUES 블록 종료
			else if (parenDepth === 0) {
				const remaining = text.substring(pos).toUpperCase();
				if (remaining.startsWith(`INSERT`) || char === `;`) {
					break;
				}
			}
		}
		pos++;
	}

	return valueRows;
};

// -------------------------------------------------------------------------------------------------
export const findInsertValues = function* (text: string): Generator<ParsedInsert> {
	let match: RegExpExecArray | null;
	INSERT_VALUES_REGEX.lastIndex = 0;

	while ((match = INSERT_VALUES_REGEX.exec(text)) !== null) {
		const columnsStr = match[1];
		const valuesStartIdx = match.index + match[0].length;
		const valueRows = parseValuesBlock(text, valuesStartIdx);

		yield {
			"columns": parseColumns(columnsStr),
			"valueRows": valueRows,
		};
	}
};

// -------------------------------------------------------------------------------------------------
export const findInsertSelect = function* (text: string): Generator<ParsedInsert> {
	let match: RegExpExecArray | null;
	INSERT_SELECT_REGEX.lastIndex = 0;

	while ((match = INSERT_SELECT_REGEX.exec(text)) !== null) {
		const columnsStr = match[1];
		const selectStr = match[2];
		const columns = parseColumns(columnsStr);
		const selectExprs = parseSelectColumns(selectStr);

		const selectKeywordIdx = text.toUpperCase().indexOf(`SELECT`, match.index);
		const selectContentStart = selectKeywordIdx + 6;

		const valueRows: ValueRow[] = [];
		let searchPos = selectContentStart;

		for (const expr of selectExprs) {
			const trimmedExpr = expr.trim();
			const position = text.indexOf(trimmedExpr, searchPos);

			if (position !== -1) {
				valueRows.push({
					"values": [
						trimmedExpr,
					],
					"position": position,
				});
				searchPos = position + trimmedExpr.length;
			}
		}

		if (valueRows.length === columns.length) {
			yield {
				"columns": columns,
				"valueRows": valueRows.map((row) => ({
					"values": [
						row.values[0],
					],
					"position": row.position,
				})),
			};
		}
	}
};

// -------------------------------------------------------------------------------------------------
export const isValidInsert = (parsed: ParsedInsert): boolean => {
	if (parsed.valueRows.length === 0) {
		return false;
	}

	for (const row of parsed.valueRows) {
		if (row.values.length !== parsed.columns.length) {
			return false;
		}
	}
	return true;
};

// -------------------------------------------------------------------------------------------------
export const isValidInsertSelect = (parsed: ParsedInsert): boolean => {
	const rs = parsed.valueRows.length === parsed.columns.length;
	return rs;
};
