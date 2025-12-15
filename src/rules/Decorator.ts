/**
 * @file Decorator.ts
 * @description SQL 키워드 구문 하이라이팅 (대문자 예약어만 적용)
 * @author Jungho
 * @since 2025-12-8
 */

import { vscode } from "@exportLibs";

// -------------------------------------------------------------------------------------------------
interface KeywordGroup {
	pattern: RegExp;
	decorationType: vscode.TextEditorDecorationType;
	useExclusions?: boolean;
	exclusionKind?: `standard` | `invalidComment`;
}

// 1. 일반 SQL 키워드 (PURPLE #B77ECA) -----------------------------------------------------------
const SQL_KEYWORDS = (
	`SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|NATURAL|ON|USING|GROUP|ORDER|BY|HAVING|LIMIT|OFFSET|AS|DISTINCT|UNION|ALL|EXISTS|AND|OR|NOT|IN|IS|NULL|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|DEFAULT|UNIQUE|PRIMARY|FOREIGN|KEY|REFERENCES|INDEX|TABLE|DATABASE|VIEW|CREATE|ALTER|RENAME|REPLACE`
);

// 2. 위험 명령어 (RED #F44747) ------------------------------------------------------------------
const DANGER_KEYWORDS = (
	`DROP|TRUNCATE|GRANT|REVOKE|KILL|SHUTDOWN|PURGE`
);

// 3. SQL 주석 패턴 (사용자 테마 comment 색상) ---------------------------------------------------
const COMMENT_PATTERN = (
	`<!--[\\s\\S]*?-->`
);

// 3-1. 허용되지 않는 주석 패턴(오류 표시) -------------------------------------------------------
const INVALID_COMMENT_PATTERN = (
	`--[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\\/`
);

// 4. SQL 문자열/숫자 패턴 ---------------------------------------------------------------------
// XML 속성 값(예: id="x")에 영향을 줄이기 위해 문자열은 단일 인용부호만 처리
const STRING_PATTERN = (`'(?:''|[^'])*'`);
const NUMBER_PATTERN = (`\\b(?:0x[0-9A-Fa-f]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b`);

// 5. XML 태그 영역 (<...>) 제외 패턴 ----------------------------------------------------------
const XML_TAG_PATTERN = (`<[\\s\\S]*?>`);

// -------------------------------------------------------------------------------------------------
const createDecorationType = (color: string | vscode.ThemeColor, bold = false): vscode.TextEditorDecorationType => {
	const rs = vscode.window.createTextEditorDecorationType({
		color: color,
		fontWeight: bold ? `bold` : `normal`,
	});
	return rs;
};

const createErrorDecorationType = (): vscode.TextEditorDecorationType => {
	const rs = vscode.window.createTextEditorDecorationType({
		color: `#F44747`,
		textDecoration: `underline wavy #F44747`,
	});
	return rs;
};

// -------------------------------------------------------------------------------------------------
let keywordGroups: KeywordGroup[] = [];
let activeEditor: vscode.TextEditor | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;

// 4. 설정값 조회 --------------------------------------------------------------------------------
const getConfig = <T>(key: string, defaultValue: T): T => {
	const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`);
	const rs = config.get<T>(key, defaultValue);
	return rs;
};

// 5. 데코레이터 초기화 --------------------------------------------------------------------------
const initDecorators = (): void => {
	keywordGroups.forEach((group) => {
		group.decorationType.dispose();
	});

	// 대문자만 매칭하기 위해 'g' 플래그만 사용 (i 플래그 제거)
	// \b 단어 경계로 완전한 단어만 매칭
	const commentColor = getConfig<string>(`commentColor`, `#ffff00`);
	const stringColor = getConfig<string>(`stringColor`, `#CE9178`);
	const numberColor = getConfig<string>(`numberColor`, `#B5CEA8`);
	keywordGroups = [
		{
			pattern: new RegExp(COMMENT_PATTERN, `g`),
			decorationType: createDecorationType(commentColor),
		},
		{
			pattern: new RegExp(INVALID_COMMENT_PATTERN, `g`),
			decorationType: createErrorDecorationType(),
			useExclusions: true,
			exclusionKind: `invalidComment`,
		},
		{
			pattern: new RegExp(`\\b(${DANGER_KEYWORDS})\\b`, `g`),
			decorationType: createDecorationType(`#F44747`, true),
			useExclusions: true,
			exclusionKind: `standard`,
		},
		{
			pattern: new RegExp(`\\b(${SQL_KEYWORDS})\\b`, `g`),
			decorationType: createDecorationType(`#B77ECA`, true),
			useExclusions: true,
			exclusionKind: `standard`,
		},
		{
			pattern: new RegExp(STRING_PATTERN, `g`),
			decorationType: createDecorationType(stringColor),
			useExclusions: true,
			exclusionKind: `standard`,
		},
		{
			pattern: new RegExp(NUMBER_PATTERN, `g`),
			decorationType: createDecorationType(numberColor),
			useExclusions: true,
			exclusionKind: `standard`,
		},
	];
};

// 6. 제외 범위 생성 (주석 + XML 태그) -----------------------------------------------------------
type ExclusionRange = { start: number; end: number };

const buildExclusionRanges = (text: string, lang: string): ExclusionRange[] => {
	const ranges: ExclusionRange[] = [];

	const commentRegex = new RegExp(COMMENT_PATTERN, `g`);
	let match: RegExpExecArray | null;
	while ((match = commentRegex.exec(text)) !== null) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}

	if (lang === `xml`) {
		const tagRegex = new RegExp(XML_TAG_PATTERN, `g`);
		while ((match = tagRegex.exec(text)) !== null) {
			ranges.push({ start: match.index, end: match.index + match[0].length });
		}
	}

	ranges.sort((a, b) => a.start - b.start);

	// 병합(겹침/인접)하여 탐색 비용 감소
	const merged: ExclusionRange[] = [];
	for (const r of ranges) {
		const last = merged.length > 0 ? merged.at(-1) : undefined;
		!last ? (
			merged.push(r)
		) : r.start <= last.end ? (
			(last.end = Math.max(last.end, r.end))
		) : (
			merged.push(r)
		);
	}

	return merged;
};

const buildInvalidCommentExclusionRanges = (text: string, lang: string): ExclusionRange[] => {
	const ranges = buildExclusionRanges(text, lang);

	// 문자열 내부의 -- / /* */ 를 오탐으로 표시하지 않도록 제외 범위에 추가
	const stringRegex = new RegExp(STRING_PATTERN, `g`);
	let match: RegExpExecArray | null;
	while ((match = stringRegex.exec(text)) !== null) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}

	ranges.sort((a, b) => a.start - b.start);
	const merged: ExclusionRange[] = [];
	for (const r of ranges) {
		const last = merged.length > 0 ? merged.at(-1) : undefined;
		!last ? (
			merged.push(r)
		) : r.start <= last.end ? (
			(last.end = Math.max(last.end, r.end))
		) : (
			merged.push(r)
		);
	}

	return merged;
};

const isIndexExcluded = (ranges: ExclusionRange[], index: number): boolean => {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const r = ranges[mid];
		if (index < r.start) {
			hi = mid - 1;
		}
		else if (index >= r.end) {
			lo = mid + 1;
		}
		else {
			return true;
		}
	}
	return false;
};

// 8. 데코레이션 업데이트 ------------------------------------------------------------------------
const updateDecorations = (): void => {
	if (!activeEditor) {
		return;
	}

	const lang = activeEditor.document.languageId;
	if (lang !== `sql` && lang !== `xml`) {
		return;
	}

	const text = activeEditor.document.getText();
	const standardExclusionRanges = buildExclusionRanges(text, lang);
	const invalidCommentExclusionRanges = buildInvalidCommentExclusionRanges(text, lang);

	for (const group of keywordGroups) {
		const decorations: vscode.DecorationOptions[] = [];
		let match: RegExpExecArray | null;
		group.pattern.lastIndex = 0;
		const exclusionRanges = group.exclusionKind === `invalidComment` ? invalidCommentExclusionRanges : standardExclusionRanges;

		while ((match = group.pattern.exec(text)) !== null) {
			if (group.useExclusions && isIndexExcluded(exclusionRanges, match.index)) {
				continue;
			}
			const startPos = activeEditor.document.positionAt(match.index);
			const endPos = activeEditor.document.positionAt(match.index + match[0].length);
			decorations.push({
				range: new vscode.Range(startPos, endPos),
			});
		}

		activeEditor.setDecorations(group.decorationType, decorations);
	}
};

// 9. 디바운스 트리거 ---------------------------------------------------------------------------
const triggerUpdateDecorations = (throttle = false): void => {
	if (timeout) {
		clearTimeout(timeout);
		timeout = undefined;
	}

	const delay = throttle ? 500 : 0;
	timeout = setTimeout(updateDecorations, delay);
};

// 10. SQL 키워드 하이라이팅 등록 ---------------------------------------------------------------
export const createKeywordDecorator = (): vscode.Disposable[] => {
	const enableHighlight = getConfig<boolean>(`enableKeywordHighlight`, true);
	if (!enableHighlight) {
		return [];
	}

	initDecorators();
	activeEditor = vscode.window.activeTextEditor;

	if (activeEditor) {
		triggerUpdateDecorations();
	}

	const disposables: vscode.Disposable[] = [];

	// 에디터 변경 감지
	disposables.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			activeEditor = editor;
			if (editor) {
				triggerUpdateDecorations();
			}
		})
	);

	// 문서 변경 감지
	disposables.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (activeEditor && event.document === activeEditor.document) {
				triggerUpdateDecorations(true);
			}
		})
	);

	// 데코레이터 정리
	disposables.push({
		dispose: () => {
			keywordGroups.forEach((group) => {
				group.decorationType.dispose();
			});
			keywordGroups = [];
		},
	});

	return disposables;
};
