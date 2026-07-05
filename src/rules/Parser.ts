/**
 * @file Parser.ts
 * @description SQL INSERT 문 파싱 로직
 * @author Jungho
 * @since 2025-12-8
 */

import type { ParsedInsert, ParsedRowValues as PrsdRwVals, ValueRow } from "@exportTypes";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const INSR_VALS_RE = /insert\s+into\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+))*\s*\(([\S\s]*?)\)\s*values\s*/gi;
const INSR_SLCT_RE = /insert\s+into\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+))*\s*\(([\S\s]*?)\)\s*select\s+/gi;
const UPDATE_REGEX = /update\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+))*\s+set\s+/gi;
const RPLC_VALS_RE = /replace\s+into\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+))*\s*\(([\S\s]*?)\)\s*values\s*/gi;
const columnsCache: Map<string, string[]> = new Map();
const CLMN_CCH_MAX = 500;

// 0. SQL 식별자 정규화 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const nrmlId = (identifier: string): string => {
  const trimmed = identifier.trim();
  const hsDblQts = trimmed.startsWith(`"`) && trimmed.endsWith(`"`);
  const hasBackticks = trimmed.charCodeAt(0) === 96 && trimmed.charCodeAt(trimmed.length - 1) === 96;
  const hasBrackets = trimmed.startsWith(`[`) && trimmed.endsWith(`]`);
  const rs = hsDblQts || hasBackticks || hasBrackets ? trimmed.slice(1, -1) : trimmed;
  return rs;
};

// 0-1. 키워드 위치 검사 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const hasKeywordAt = (text: string, index: number, keyword: string): boolean => {
  let matches = index + keyword.length <= text.length;
  let offset = 0;

  while (matches && offset < keyword.length) {
    const actualCode = text.charCodeAt(index + offset);
    const expectedCode = keyword.charCodeAt(offset);
    matches = actualCode === expectedCode || actualCode === expectedCode + 32;
    offset++;
  }
  return matches;
};

// 1. 컬럼 문자열 파싱 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const parseColumns = (columnsStr: string): string[] => {
  const cached = columnsCache.get(columnsStr);
  const rs = cached ?? columnsStr.split(`,`).map((col) => nrmlId(col));
  if (!cached) {
    // 캐시 무한 증가 방지: 상한 초과 시 가장 오래된 항목 제거
    if (columnsCache.size >= CLMN_CCH_MAX) {
      const oldest = columnsCache.keys().next().value;
      if (oldest !== undefined) {
        columnsCache.delete(oldest);
      }
    }
    columnsCache.set(columnsStr, rs);
  }
  return rs;
};

// 2. VALUES 행의 각 값과 위치 파싱 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export const prsRwVals = (rowStr: string): PrsdRwVals => {
  const values: string[] = [];
  const positions: number[] = [];
  const endPositions: number[] = [];
  let current = ``;
  let currentStart = -1;
  let currentEnd = -1;
  let inString = false;
  let stringChar = ``;
  let parenDepth = 0;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];

    // SQL 표준 이스케이프 처리 ('' 또는 "")
    if (inString && char === stringChar && rowStr[i + 1] === char) {
    	current += char + rowStr[i + 1];
      currentEnd = i + 1;
      i++;
      continue;
    }
    const isStrStrt = (char=== `'` || char=== `"`) && !inString;
    const isStringEnd = inString && char === stringChar;
    const isComma = char === `,` && !inString && parenDepth === 0;

    if (isComma) {
    	values.push(current.trim());
      positions.push(currentStart);
      endPositions.push(currentEnd + 1);
      current = ``;
      currentStart = -1;
      currentEnd = -1;
    }
    else if (isStrStrt) {
      if (currentStart === -1) {
      	currentStart = i;
      }
      inString = true;
      stringChar = char;
      current += char;
      currentEnd = i;
    }
    else if (isStringEnd) {
    	inString = false;
      stringChar = ``;
      current += char;
      currentEnd = i;
    }
    else {
      const hasText = Boolean(char.trim());
      if (currentStart === -1 && hasText) {
      	currentStart = i;
      }
      if (hasText) {
      	currentEnd = i;
      }
      if (!inString && char === `(`) {
      	parenDepth++;
      }
      if (!inString && char === `)`) {
      	parenDepth--;
      }
      current += char;
    }
  }
  if (current.trim()) {
  	values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }
  const rs: PrsdRwVals = {
    values: values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 3. SELECT 컬럼 표현식 파싱 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export const prsSlctClmn = (selectStr: string): PrsdRwVals => {
  const values: string[] = [];
  const positions: number[] = [];
  const endPositions: number[] = [];
  let current = ``;
  let currentStart = -1;
  let currentEnd = -1;
  let inString = false;
  let stringChar = ``;
  let parenDepth = 0;

  for (let i = 0; i < selectStr.length; i++) {
    const char = selectStr[i];

    // SQL 표준 이스케이프 처리
    if (inString && char === stringChar && selectStr[i + 1] === char) {
    	current += char + selectStr[i + 1];
      currentEnd = i + 1;
      i++;
      continue;
    }
    const isStrStrt = (char=== `'` || char=== `"`) && !inString;
    const isStringEnd = inString && char === stringChar;
    const isComma = char === `,` && !inString && parenDepth === 0;

    if (isComma) {
    	values.push(current.trim());
      positions.push(currentStart);
      endPositions.push(currentEnd + 1);
      current = ``;
      currentStart = -1;
      currentEnd = -1;
    }
    else if (isStrStrt) {
      if (currentStart === -1) {
      	currentStart = i;
      }
      inString = true;
      stringChar = char;
      current += char;
      currentEnd = i;
    }
    else if (isStringEnd) {
    	inString = false;
      stringChar = ``;
      current += char;
      currentEnd = i;
    }
    else {
      const hasText = Boolean(char.trim());
      if (currentStart === -1 && hasText) {
      	currentStart = i;
      }
      if (hasText) {
      	currentEnd = i;
      }
      if (!inString && char === `(`) {
      	parenDepth++;
      }
      if (!inString && char === `)`) {
      	parenDepth--;
      }
      current += char;
    }
  }
  if (current.trim()) {
  	values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }
  const rs: PrsdRwVals = {
    values: values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 4. VALUES 블록 전체 파싱 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const prsValsBlck = (text: string, startPos: number): ValueRow[] => {
  const valueRows: ValueRow[] = [];
  let pos = startPos;
  let inString = false;
  let stringChar = ``;
  let parenDepth = 0;
  let curRwStrt = -1;

  while (pos < text.length) {
    const char = text[pos];

    // SQL 표준 이스케이프 처리 ('' 또는 "")
    if (inString && char === stringChar && text[pos + 1] === char) {
    	pos += 2;
      continue;
    }
    // 문자열 시작/종료 처리
    if ((char === `'` || char === `"`) && !inString) {
    	inString = true;
      stringChar = char;
    }
    else if (inString && char === stringChar) {
    	inString = false;
      stringChar = ``;
    }
    if (!inString) {
      if (char === `(`) {
        if (parenDepth === 0) {
        	curRwStrt = pos;
        }
        parenDepth++;
      }
      else if (char === `)`) {
        parenDepth--;
        if (parenDepth === 0 && curRwStrt !== -1) {
          const rowContent = text.slice(curRwStrt + 1, pos);
          const parsed = prsRwVals(rowContent);
          const rowStartPos = curRwStrt + 1;
          valueRows.push({
            values: parsed.values,
            position: rowStartPos,
            valuePositions: parsed.positions.map((p) => rowStartPos + p),
            valueEndPositions: parsed.endPositions.map((p) => rowStartPos + p),
          });
          curRwStrt = -1;
        }
      }
      else if (parenDepth === 0) {
        const isInsrStrt = (char === `I` || char === `i`) && hasKeywordAt(text, pos, `INSERT`);
        if (isInsrStrt || char === `;`) {
        	break;
        }
      }
    }
    pos++;
  }
  return valueRows;
};

// 5. INSERT INTO ... VALUES 문 검색 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
export const fndInsrVals = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  INSR_VALS_RE.lastIndex = 0;

  match = INSR_VALS_RE.exec(text);
  while (match !== null) {
    const columnsStr = match[1];
    const valsStrtIdx = match.index + match[0].length;
    const valueRows = prsValsBlck(text, valsStrtIdx);

    yield {
      columns: parseColumns(columnsStr),
      valueRows: valueRows,
    };
    match = INSR_VALS_RE.exec(text);
  }
};

// 6. SELECT 컬럼 영역 추출 (FROM 전까지, 서브쿼리 고려) ―――――――――――――――――――――――――――――――――――――――--
const extrSlctClmn = (text: string, startPos: number): string => {
  let pos = startPos;
  let parenDepth = 0;
  let inString = false;
  let stringChar = ``;

  while (pos < text.length) {
    const char = text[pos];

    // SQL 이스케이프 처리
    if (inString && char === stringChar && text[pos + 1] === char) {
    	pos += 2;
      continue;
    }
    // 문자열 시작/종료
    if ((char === `'` || char === `"`) && !inString) {
    	inString = true;
      stringChar = char;
    }
    else if (inString && char === stringChar) {
    	inString = false;
      stringChar = ``;
    }
    if (!inString) {
      if (char === `(`) {
      	parenDepth++;
      }
      else if (char === `)`) {
      	parenDepth--;
      }
      // parenDepth가 0일 때만 FROM 키워드 또는 문장 종료(;) 확인
      else if (parenDepth === 0) {
        if (char === `;`) {
        	break;
        }
        const nextChar = text[pos + 4];
        const isFromStart = (char === `F` || char === `f`) && hasKeywordAt(text, pos, `FROM`);
        if (isFromStart && nextChar !== undefined && (nextChar === `(` || nextChar.trim() === ``)) {
        	break;
        }
      }
    }
    pos++;
  }
  const rs = text.slice(startPos, pos);
  return rs;
};

// 7. INSERT INTO ... SELECT 문 검색 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
export const fndInsrSlct = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  INSR_SLCT_RE.lastIndex = 0;

  match = INSR_SLCT_RE.exec(text);
  while (match !== null) {
    const columnsStr = match[1];
    const columns = parseColumns(columnsStr);
    const slctContStrt = match.index + match[0].length;

    // SELECT 뒤부터 FROM 전까지 파싱 (서브쿼리 고려)
    const selectStr = extrSlctClmn(text, slctContStrt);
    const parsed = prsSlctClmn(selectStr);

    const valueRows: ValueRow[] = parsed.values.map((value, i) => {
      const relativePos = parsed.positions[i];
      const rltvEndPs = parsed.endPositions[i];
      const absolutePos = relativePos >= 0 ? slctContStrt + relativePos : -1;
      const abslEndPs = rltvEndPs >= 0 ? slctContStrt + rltvEndPs : -1;
      const rs: ValueRow = {
        values: [value],
        position: absolutePos,
        valuePositions: [absolutePos],
        valueEndPositions: [abslEndPs],
      };
      return rs;
    });

    if (valueRows.length === columns.length) {
      yield {
        columns: columns,
        valueRows: valueRows,
      };
    }
    match = INSR_SLCT_RE.exec(text);
  }
};

// 8. INSERT VALUES 유효성 검사 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const isVldInsr = (parsed: ParsedInsert): boolean => {
  const hasRows = parsed.valueRows.length > 0;
  const allMatch = parsed.valueRows.every((row) => row.values.length === parsed.columns.length);
  const rs = hasRows && allMatch;
  return rs;
};

// 9. INSERT SELECT 유효성 검사 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const isVlInSl = (parsed: ParsedInsert): boolean => {
  const rs = parsed.valueRows.length === parsed.columns.length;
  return rs;
};

// 10. UPDATE SET 절 파싱 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const prsUpdtSt = (setStr: string): PrsdRwVals => {
  const columns: string[] = [];
  const values: string[] = [];
  const positions: number[] = [];
  const endPositions: number[] = [];
  let current = ``;
  let currentCol = ``;
  let currentStart = -1;
  let currentEnd = -1;
  let inString = false;
  let stringChar = ``;
  let parenDepth = 0;
  let beforeEquals = true;

  for (let i = 0; i < setStr.length; i++) {
    const char = setStr[i];

    if (inString && char === stringChar && setStr[i + 1] === char) {
    	current += char + setStr[i + 1];
      currentEnd = i + 1;
      i++;
      continue;
    }
    const isStrStrt = (char=== `'` || char=== `"`) && !inString;
    const isStringEnd = inString && char === stringChar;
    const isEquals = char === `=` && !inString && parenDepth === 0;
    const isComma = char === `,` && !inString && parenDepth === 0;

    if (isComma) {
      if (!beforeEquals) {
      	values.push(current.trim());
        positions.push(currentStart);
        endPositions.push(currentEnd + 1);
        current = ``;
        currentStart = -1;
        currentEnd = -1;
        beforeEquals = true;
      }
    }
    else if (isEquals) {
    	currentCol = nrmlId(current);
      columns.push(currentCol);
      current = ``;
      currentStart = -1;
      currentEnd = -1;
      beforeEquals = false;
    }
    else if (isStrStrt) {
      if (currentStart === -1) {
      	currentStart = i;
      }
      inString = true;
      stringChar = char;
      current += char;
      currentEnd = i;
    }
    else if (isStringEnd) {
    	inString = false;
      stringChar = ``;
      current += char;
      currentEnd = i;
    }
    else {
      const hasText = Boolean(char.trim());
      if (currentStart === -1 && hasText) {
      	currentStart = i;
      }
      if (hasText) {
      	currentEnd = i;
      }
      if (!inString && char === `(`) {
      	parenDepth++;
      }
      if (!inString && char === `)`) {
      	parenDepth--;
      }
      current += char;
    }
  }
  if (current.trim() && !beforeEquals) {
  	values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }
  const rs: PrsdRwVals = {
    values: columns.length === values.length ? columns : values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 11. UPDATE 문 검색 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const fndUpdtSttm = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  UPDATE_REGEX.lastIndex = 0;

  match = UPDATE_REGEX.exec(text);
  while (match !== null) {
    const setStartIdx = match.index + match[0].length;
    let pos = setStartIdx;
    let inString = false;
    let stringChar = ``;
    let parenDepth = 0;
    let setContent = ``;

    while (pos < text.length) {
      const char = text[pos];

      if (inString && char === stringChar && text[pos + 1] === char) {
      	setContent += char + text[pos + 1];
        pos += 2;
        continue;
      }
      if ((char === `'` || char === `"`) && !inString) {
      	inString = true;
        stringChar = char;
      }
      else if (inString && char === stringChar) {
      	inString = false;
        stringChar = ``;
      }
      if (!inString) {
        if (char === `(`) {
        	parenDepth++;
        }
        else if (char === `)`) {
        	parenDepth--;
        }
        else if (parenDepth === 0) {
          const remaining = text.slice(pos, pos + 10).toUpperCase();
          if (remaining.startsWith(`WHERE`) || remaining.startsWith(`FROM`) || char === `;`) {
          	break;
          }
        }
      }
      setContent += char;
      pos++;
    }
    const parsed = prsUpdtSt(setContent);
    const columns = parsed.values;
    const valueRows: ValueRow[] = [];

    for (let i = 0; i < columns.length; i++) {
      const relativePos = parsed.positions[i];
      const rltvEndPs = parsed.endPositions[i];
      const absolutePos = relativePos >= 0 ? setStartIdx + relativePos : -1;
      const abslEndPs = rltvEndPs >= 0 ? setStartIdx + rltvEndPs : -1;
      valueRows.push({
        values: [columns[i]],
        position: absolutePos,
        valuePositions: [absolutePos],
        valueEndPositions: [abslEndPs],
      });
    }
    if (valueRows.length > 0) {
      yield {
        columns: columns,
        valueRows: valueRows,
      };
    }
    match = UPDATE_REGEX.exec(text);
  }
};

// 12. REPLACE INTO 문 검색 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const fndRplcVals = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  RPLC_VALS_RE.lastIndex = 0;

  match = RPLC_VALS_RE.exec(text);
  while (match !== null) {
    const columnsStr = match[1];
    const valsStrtIdx = match.index + match[0].length;
    const valueRows = prsValsBlck(text, valsStrtIdx);

    yield {
      columns: parseColumns(columnsStr),
      valueRows: valueRows,
    };
    match = RPLC_VALS_RE.exec(text);
  }
};
