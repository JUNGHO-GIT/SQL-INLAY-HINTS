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
  `SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|NATURAL|ON|USING|GROUP|ORDER|BY|HAVING|LIMIT|OFFSET|AS|DISTINCT|UNION|ALL|EXISTS|AND|OR|NOT|IN|IS|NULL|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|DEFAULT|UNIQUE|PRIMARY|FOREIGN|KEY|REFERENCES|INDEX|TABLE|DATABASE|VIEW|CREATE|ALTER|RENAME|REPLACE|` +
  `BEGIN|COMMIT|ROLLBACK|SAVEPOINT|TRANSACTION|START|` +
  `WITH|RECURSIVE|` +
  `OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|NTILE|` +
  `COUNT|SUM|AVG|MAX|MIN|CONCAT|SUBSTRING|UPPER|LOWER|TRIM|COALESCE|IFNULL|NULLIF|CAST|CONVERT|LENGTH|ROUND|FLOOR|CEIL|ABS|NOW|CURDATE|CURTIME|DATE_FORMAT|STR_TO_DATE|` +
  `INT|INTEGER|VARCHAR|TEXT|CHAR|DATE|DATETIME|TIMESTAMP|TIME|BOOLEAN|BOOL|FLOAT|DOUBLE|DECIMAL|NUMERIC|BIGINT|SMALLINT|TINYINT|MEDIUMINT|BLOB|CLOB|JSON|XML|BINARY|VARBINARY|LONGTEXT|MEDIUMTEXT|` +
  `CONSTRAINT|CHECK|AUTO_INCREMENT|SERIAL|IDENTITY|UNSIGNED|SIGNED|ZEROFILL|` +
  `IF|ELSEIF|SHOW|DESCRIBE|EXPLAIN|USE|CALL|PROCEDURE|FUNCTION|TRIGGER|EVENT|SCHEMA|COLLATE|CHARACTER|CHARSET|LOCK|UNLOCK|TEMPORARY|TEMP|MATERIALIZED|MERGE|UPSERT|` +
  `DISTINCT|PIVOT|UNPIVOT|LATERAL|WINDOW|FETCH|FIRST|LAST|ONLY|ROWS|RANGE|PRECEDING|FOLLOWING|UNBOUNDED|CURRENT|ROW|TIES|EXCLUDE|NO|ACTION|CASCADE|RESTRICT|NULLS|IGNORE|FORCE|STRAIGHT_JOIN`
);

// 2. 위험 명령어 (RED #F44747) ------------------------------------------------------------------
const DANGER_KEYWORDS = (
  `DROP|TRUNCATE|GRANT|REVOKE|KILL|SHUTDOWN|PURGE|FLUSH|RESET`
);

// 3. 주석 패턴 ---------------------------------------------------------------------------------
const XML_COMMENT_PATTERN = (`<!--[\\s\\S]*?-->`);
const SQL_COMMENT_PATTERN = (`--[^\\r\\n]*|/\\*[\\s\\S]*?\\*/`);

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
let xmlKeywordGroups: KeywordGroup[] = [];
let sqlKeywordGroups: KeywordGroup[] = [];

const initDecorators = (): void => {
  keywordGroups.forEach((group) => {
    group.decorationType.dispose();
  });
  xmlKeywordGroups.forEach((group) => {
    group.decorationType.dispose();
  });
  sqlKeywordGroups.forEach((group) => {
    group.decorationType.dispose();
  });

  // 대문자만 매칭하기 위해 'g' 플래그만 사용 (i 플래그 제거)
  // \b 단어 경계로 완전한 단어만 매칭
  const commentColor = getConfig<string>(`commentColor`, `#ffff00`);
  const commentColor2 = getConfig<string>(`commentColor2`, `#5d9b5d`);
  const stringColor = getConfig<string>(`stringColor`, `#CE9178`);
  const numberColor = getConfig<string>(`numberColor`, `#B5CEA8`);

  // 공통 키워드 그룹
  keywordGroups = [
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

  // XML 전용: <!-- --> 노란색, /* */ 와 -- 는 어두운 녹색
  xmlKeywordGroups = [
    {
      pattern: new RegExp(XML_COMMENT_PATTERN, `g`),
      decorationType: createDecorationType(commentColor),
    },
    {
      pattern: new RegExp(SQL_COMMENT_PATTERN, `g`),
      decorationType: createDecorationType(commentColor2),
      useExclusions: true,
      exclusionKind: `invalidComment`,
    },
  ];

  // SQL 전용: /* */ 와 -- 만 노란색, <!-- --> 는 녹색 (허용 안 함)
  sqlKeywordGroups = [
    {
      pattern: new RegExp(SQL_COMMENT_PATTERN, `g`),
      decorationType: createDecorationType(commentColor),
      useExclusions: true,
      exclusionKind: `invalidComment`,
    },
    {
      pattern: new RegExp(XML_COMMENT_PATTERN, `g`),
      decorationType: createDecorationType(commentColor2),
    },
  ];
};

// 6. 제외 범위 생성 (주석 + XML 태그) -----------------------------------------------------------
type ExclusionRange = { start: number; end: number };

const buildExclusionRanges = (text: string, lang: string): ExclusionRange[] => {
  const ranges: ExclusionRange[] = [];
  let match: RegExpExecArray | null;

  // XML: <!-- --> 주석 제외
  if (lang === `xml`) {
    const xmlCommentRegex = new RegExp(XML_COMMENT_PATTERN, `g`);
    while ((match = xmlCommentRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // SQL/XML 공통: /* */ 와 -- 주석 제외
  const sqlCommentRegex = new RegExp(SQL_COMMENT_PATTERN, `g`);
  while ((match = sqlCommentRegex.exec(text)) !== null) {
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
  const ranges: ExclusionRange[] = [];
  let match: RegExpExecArray | null;

  // XML 주석 제외 (<!-- ... --> 내부의 -- 가 SQL 주석으로 오인되지 않도록)
  const xmlCommentRegex = new RegExp(XML_COMMENT_PATTERN, `g`);
  while ((match = xmlCommentRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  // XML: 태그 영역 제외
  if (lang === `xml`) {
    const tagRegex = new RegExp(XML_TAG_PATTERN, `g`);
    while ((match = tagRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // 문자열 내부의 -- / /* */ 를 오탐으로 표시하지 않도록 제외 범위에 추가
  const stringRegex = new RegExp(STRING_PATTERN, `g`);
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

  // 언어별 주석 그룹 선택
  const langSpecificGroups = lang === `xml` ? xmlKeywordGroups : sqlKeywordGroups;
  const allGroups = [ ...langSpecificGroups, ...keywordGroups ];

  for (const group of allGroups) {
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
    }),
  );

  // 문서 변경 감지
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === activeEditor?.document) {
        triggerUpdateDecorations(true);
      }
    }),
  );

  // 데코레이터 정리
  disposables.push({
    dispose: () => {
      keywordGroups.forEach((group) => {
        group.decorationType.dispose();
      });
      xmlKeywordGroups.forEach((group) => {
        group.decorationType.dispose();
      });
      sqlKeywordGroups.forEach((group) => {
        group.decorationType.dispose();
      });
      keywordGroups = [];
      xmlKeywordGroups = [];
      sqlKeywordGroups = [];
    },
  });

  return disposables;
};
