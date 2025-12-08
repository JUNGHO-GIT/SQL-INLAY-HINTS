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
	`<!--[\\s\\S]*?-->|--[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\\/`
);

// -------------------------------------------------------------------------------------------------
const createDecorationType = (color: string | vscode.ThemeColor, bold = false): vscode.TextEditorDecorationType => {
	const rs = vscode.window.createTextEditorDecorationType({
		"color": color,
		"fontWeight": bold ? `bold` : `normal`,
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
	keywordGroups = [
		{
			"pattern": new RegExp(COMMENT_PATTERN, `g`),
			"decorationType": createDecorationType(commentColor),
		},
		{
			"pattern": new RegExp(`\\b(${DANGER_KEYWORDS})\\b`, `g`),
			"decorationType": createDecorationType(`#F44747`, true),
		},
		{
			"pattern": new RegExp(`\\b(${SQL_KEYWORDS})\\b`, `g`),
			"decorationType": createDecorationType(`#B77ECA`, true),
		},
	];
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

	for (const group of keywordGroups) {
		const decorations: vscode.DecorationOptions[] = [];
		let match: RegExpExecArray | null;
		group.pattern.lastIndex = 0;

		while ((match = group.pattern.exec(text)) !== null) {
			const startPos = activeEditor.document.positionAt(match.index);
			const endPos = activeEditor.document.positionAt(match.index + match[0].length);
			decorations.push({
				"range": new vscode.Range(startPos, endPos),
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
		"dispose": () => {
			keywordGroups.forEach((group) => {
				group.decorationType.dispose();
			});
			keywordGroups = [];
		},
	});

	return disposables;
};
