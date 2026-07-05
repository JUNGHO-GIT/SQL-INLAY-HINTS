/**
 * @file Decorator.ts
 * @description SQL 키워드 구문 하이라이팅 (대문자 예약어만 적용)
 * @author Jungho
 * @since 2025-12-8
 */

import { vscode } from "@exportLibs";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
interface KeywordGroup {
  decorationType: vscode.TextEditorDecorationType;
  exclusionKind?: `standard` | `invalidComment`;
  pattern: RegExp;
  useExclusions?: boolean;
}

interface DecorationCache {
  editor: vscode.TextEditor;
  maxDocumentLength: number;
  uri: string;
  version: number;
}

// 1. 일반 SQL 키워드 (PURPLE #B77ECA) ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const SQL_KEYWORDS = `SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|NATURAL|ON|USING|GROUP|ORDER|BY|HAVING|LIMIT|OFFSET|AS|DISTINCT|UNION|ALL|EXISTS|AND|OR|NOT|IN|IS|NULL|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|DEFAULT|UNIQUE|PRIMARY|FOREIGN|KEY|REFERENCES|INDEX|TABLE|DATABASE|VIEW|CREATE|ALTER|RENAME|REPLACE|` +
  `BEGIN|COMMIT|ROLLBACK|SAVEPOINT|TRANSACTION|START|` +
  `WITH|RECURSIVE|` +
  `OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|NTILE|` +
  `COUNT|SUM|AVG|MAX|MIN|CONCAT|SUBSTRING|UPPER|LOWER|TRIM|COALESCE|IFNULL|NULLIF|CAST|CONVERT|LENGTH|ROUND|FLOOR|CEIL|ABS|NOW|CURDATE|CURTIME|DATE_FORMAT|STR_TO_DATE|` +
  `INT|INTEGER|VARCHAR|TEXT|CHAR|DATE|DATETIME|TIMESTAMP|TIME|BOOLEAN|BOOL|FLOAT|DOUBLE|DECIMAL|NUMERIC|BIGINT|SMALLINT|TINYINT|MEDIUMINT|BLOB|CLOB|JSON|XML|BINARY|VARBINARY|LONGTEXT|MEDIUMTEXT|` +
  `CONSTRAINT|CHECK|AUTO_INCREMENT|SERIAL|IDENTITY|UNSIGNED|SIGNED|ZEROFILL|` +
  `IF|ELSEIF|SHOW|DESCRIBE|EXPLAIN|USE|CALL|PROCEDURE|FUNCTION|TRIGGER|EVENT|SCHEMA|COLLATE|CHARACTER|CHARSET|LOCK|UNLOCK|TEMPORARY|TEMP|MATERIALIZED|MERGE|UPSERT|` +
  `DISTINCT|PIVOT|UNPIVOT|LATERAL|WINDOW|FETCH|FIRST|LAST|ONLY|ROWS|RANGE|PRECEDING|FOLLOWING|UNBOUNDED|CURRENT|ROW|TIES|EXCLUDE|NO|ACTION|CASCADE|RESTRICT|NULLS|IGNORE|FORCE|STRAIGHT_JOIN`;

// 2. 위험 명령어 (RED #F44747) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const DNGR_KYWR = `DROP|TRUNCATE|GRANT|REVOKE|KILL|SHUTDOWN|PURGE|FLUSH|RESET`;

// 3. 주석 패턴 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const XML_CMT_PAT = `<!--[\\s\\S]*?-->`;
const SQL_CMT_PAT = `--[^\\r\\n]*|/\\*[\\s\\S]*?\\*/`;

// 4. SQL 문자열/숫자 패턴 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// XML 속성 값(예: id="x")에 영향을 줄이기 위해 문자열은 단일 인용부호만 처리
const STR_PAT = `'(?:''|[^'])*'`;
const NMBR_PAT = `\\b(?:0x[0-9A-Fa-f]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b`;

// 5. XML 태그 영역 (<...>) 제외 패턴 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const XML_TG_PAT = `<[\\s\\S]*?>`;

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const crtDcrtTyp = (color: string | vscode.ThemeColor, bold=false): vscode.TextEditorDecorationType => {
  const rs = vscode.window.createTextEditorDecorationType({
    color: color,
    fontWeight: bold ? `bold` : `normal`,
  });
  return rs;
};

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
let kywrGrps: KeywordGroup[] = [];
let activeEditor: vscode.TextEditor | undefined;
let dcrtCch: DecorationCache | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;

// 4. 설정값 조회 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const getConfig = <T>(key: string, defaultValue: T): T => {
  const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`);
  const rs = config.get<T>(key, defaultValue);
  return rs;
};

// 4-1. 문서 길이 계산 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const gtDocLen = (document: vscode.TextDocument): number => {
  const lastLine = document.lineAt(document.lineCount - 1);
  const rs = document.offsetAt(lastLine.range.end);
  return rs;
};

// 4-2. 데코레이션 제거 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const clrDcrt = (editor: vscode.TextEditor): void => {
  for (const group of [...kywrGrps, ...xmlKywrGrps, ...sqlKywrGrps]) {
    editor.setDecorations(group.decorationType, []);
  }
};

// 5. 데코레이터 초기화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
let xmlKywrGrps: KeywordGroup[] = [];
let sqlKywrGrps: KeywordGroup[] = [];

const intDcrt = (): void => {
  kywrGrps.forEach((group) => {
    group.decorationType.dispose();
  });
  xmlKywrGrps.forEach((group) => {
    group.decorationType.dispose();
  });
  sqlKywrGrps.forEach((group) => {
    group.decorationType.dispose();
  });

  // 대문자만 매칭하기 위해 'g' 플래그만 사용 (i 플래그 제거)
  // \b 단어 경계로 완전한 단어만 매칭
  const commentColor = getConfig<string>(`commentColor`, `#ffff00`);
  const cmtClr2 = getConfig<string>(`commentColor2`, `#5d9b5d`);
  const stringColor = getConfig<string>(`stringColor`, `#f4d4ae`);
  const numberColor = getConfig<string>(`numberColor`, `#00FF00`);

  // 공통 키워드 그룹
  kywrGrps = [
    {
      pattern: new RegExp(`\\b(${DNGR_KYWR})\\b`, `g`),
      decorationType: crtDcrtTyp(`#F44747`, true),
      useExclusions: true,
      exclusionKind: `standard`,
    },
    {
      pattern: new RegExp(`\\b(${SQL_KEYWORDS})\\b`, `g`),
      decorationType: crtDcrtTyp(`#B77ECA`, true),
      useExclusions: true,
      exclusionKind: `standard`,
    },
    {
      pattern: new RegExp(STR_PAT, `g`),
      decorationType: crtDcrtTyp(stringColor),
      useExclusions: true,
      exclusionKind: `standard`,
    },
    {
      pattern: new RegExp(NMBR_PAT, `g`),
      decorationType: crtDcrtTyp(numberColor),
      useExclusions: true,
      exclusionKind: `standard`,
    },
  ];

  // XML 전용: <!-- --> 노란색, /* */ 와 -- 는 어두운 녹색
  xmlKywrGrps = [
    {
      pattern: new RegExp(XML_CMT_PAT, `g`),
      decorationType: crtDcrtTyp(commentColor),
    },
    {
      pattern: new RegExp(SQL_CMT_PAT, `g`),
      decorationType: crtDcrtTyp(cmtClr2),
      useExclusions: true,
      exclusionKind: `invalidComment`,
    },
  ];

  // SQL 전용: /* */ 와 -- 만 노란색, <!-- --> 는 녹색 (허용 안 함)
  sqlKywrGrps = [
    {
      pattern: new RegExp(SQL_CMT_PAT, `g`),
      decorationType: crtDcrtTyp(commentColor),
      useExclusions: true,
      exclusionKind: `invalidComment`,
    },
    {
      pattern: new RegExp(XML_CMT_PAT, `g`),
      decorationType: crtDcrtTyp(cmtClr2),
    },
  ];
};

// 6. 제외 범위 생성 (주석 + XML 태그) ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
type ExclusionRange = { start: number; end: number };

const bldExclRngs = (text: string, lang: string): ExclusionRange[] => {
  const ranges: ExclusionRange[] = [];
  let match: RegExpExecArray | null;

  // XML: <!-- --> 주석 제외
  if (lang === `xml`) {
    const xmlCmtRe = new RegExp(XML_CMT_PAT, `g`);
    match = xmlCmtRe.exec(text);
    while (match !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      match = xmlCmtRe.exec(text);
    }
  }
  // SQL/XML 공통: /* */ 와 -- 주석 제외
  const sqlCmtRe = new RegExp(SQL_CMT_PAT, `g`);
  match = sqlCmtRe.exec(text);
  while (match !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    match = sqlCmtRe.exec(text);
  }
  if (lang === `xml`) {
    const tagRegex = new RegExp(XML_TG_PAT, `g`);
    match = tagRegex.exec(text);
    while (match !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      match = tagRegex.exec(text);
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  // 병합(겹침/인접)하여 탐색 비용 감소
  const merged: ExclusionRange[] = [];
  for (const r of ranges) {
    const last = merged.length > 0 ? merged.at(-1) : undefined;
    if (!last) {
      merged.push(r);
    }
    else if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    }
    else {
      merged.push(r);
    }
  }
  return merged;
};

const bldInCmExRn = (text: string, lang: string): ExclusionRange[] => {
  const ranges: ExclusionRange[] = [];
  let match: RegExpExecArray | null;

  // XML 주석 제외 (<!-- ... --> 내부의 -- 가 SQL 주석으로 오인되지 않도록)
  const xmlCmtRe = new RegExp(XML_CMT_PAT, `g`);
  match = xmlCmtRe.exec(text);
  while (match !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    match = xmlCmtRe.exec(text);
  }
  // XML: 태그 영역 제외
  if (lang === `xml`) {
    const tagRegex = new RegExp(XML_TG_PAT, `g`);
    match = tagRegex.exec(text);
    while (match !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      match = tagRegex.exec(text);
    }
  }
  // 문자열 내부의 -- / /* */ 를 오탐으로 표시하지 않도록 제외 범위에 추가
  const stringRegex = new RegExp(STR_PAT, `g`);
  match = stringRegex.exec(text);
  while (match !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    match = stringRegex.exec(text);
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: ExclusionRange[] = [];
  for (const r of ranges) {
    const last = merged.length > 0 ? merged.at(-1) : undefined;
    if (!last) {
      merged.push(r);
    }
    else if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    }
    else {
      merged.push(r);
    }
  }
  return merged;
};

const isIdxExcl = (ranges: ExclusionRange[], index: number): boolean => {
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

// 8. 데코레이션 업데이트 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const updtDcrt = (): void => {
  if (!activeEditor) {
  	return;
  }
  const editor = activeEditor;
  const lang = editor.document.languageId;
  if (lang !== `sql` && lang !== `xml`) {
  	return;
  }
  const uri = editor.document.uri.toString();
  const mxDocLen = Math.max(0, getConfig<number>(`maxDocumentLength`, 300_000));
  const docLen = gtDocLen(editor.document);
  const cacheHit = dcrtCch?.editor === editor && dcrtCch.uri === uri && dcrtCch.version === editor.document.version && dcrtCch.maxDocumentLength === mxDocLen;
  if (cacheHit) {
  	return;
  }
  if (mxDocLen > 0 && docLen > mxDocLen) {
    clrDcrt(editor);
    dcrtCch = {
      editor: editor,
      maxDocumentLength: mxDocLen,
      uri: uri,
      version: editor.document.version,
    };
  	return;
  }
  const text = editor.document.getText();
  const stndExclRngs = bldExclRngs(text, lang);
  const invCmExRn = bldInCmExRn(text, lang);

  // 언어별 주석 그룹 선택
  const lngSpcfGrps = lang === `xml` ? xmlKywrGrps : sqlKywrGrps;
  const allGroups = [...lngSpcfGrps, ...kywrGrps];

  for (const group of allGroups) {
    const decorations: vscode.DecorationOptions[] = [];
    let match: RegExpExecArray | null;
    group.pattern.lastIndex = 0;
    const exclRngs = group.exclusionKind === `invalidComment` ? invCmExRn : stndExclRngs;

    match = group.pattern.exec(text);
    while (match !== null) {
      if (group.useExclusions && isIdxExcl(exclRngs, match.index)) {
        match = group.pattern.exec(text);
      	continue;
      }
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);
      decorations.push({
        range: new vscode.Range(startPos, endPos),
      });
      match = group.pattern.exec(text);
    }
    editor.setDecorations(group.decorationType, decorations);
  }
  dcrtCch = {
    editor: editor,
    maxDocumentLength: mxDocLen,
    uri: uri,
    version: editor.document.version,
  };
};

// 9. 디바운스 트리거 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const trggUpdtDcrt = (throttle=false): void => {
  if (timeout) {
  	clearTimeout(timeout);
    timeout = undefined;
  }
  const delay = throttle ? 500 : 0;
  timeout = setTimeout(updtDcrt, delay);
};

// 10. SQL 키워드 하이라이팅 등록 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const crtKywrDcrt = (): vscode.Disposable[] => {
  const enblHi = getConfig<boolean>(`enableKeywordHighlight`, true);
  if (!enblHi) {
  	return [];
  }
  intDcrt();
  activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) {
  	trggUpdtDcrt();
  }
  const disposables: vscode.Disposable[] = [];

  // 에디터 변경 감지
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      activeEditor = editor;
      if (editor) {
      	trggUpdtDcrt();
      }
    }),
  );

  // 문서 변경 감지
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === activeEditor?.document) {
      	trggUpdtDcrt(true);
      }
    }),
  );

  // 설정 변경 감지 (색상·길이 제한 등) ――――――――――――――――――――――――――――――-
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`SQL-Inlay-Hints`)) {
        intDcrt();
        dcrtCch = undefined;
        if (activeEditor) {
        	trggUpdtDcrt();
        }
      }
    }),
  );

  // 데코레이터 정리
  disposables.push({
    dispose: () => {
      if (timeout) {
      	clearTimeout(timeout);
        timeout = undefined;
      }
      dcrtCch = undefined;
      kywrGrps.forEach((group) => {
        group.decorationType.dispose();
      });
      xmlKywrGrps.forEach((group) => {
        group.decorationType.dispose();
      });
      sqlKywrGrps.forEach((group) => {
        group.decorationType.dispose();
      });
      kywrGrps = [];
      xmlKywrGrps = [];
      sqlKywrGrps = [];
    },
  });

  return disposables;
};
