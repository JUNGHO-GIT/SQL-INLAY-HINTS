/**
 * @file Parser.ts
 * @description SQL INSERT 문 파싱 로직
 * @author Jungho
 * @since 2025-12-8
 */

import type { ParsedInsert, ValueRow, ParsedRowValues } from "@exportTypes";

// -------------------------------------------------------------------------------------------------
const INSERT_VALUES_REGEX = /insert\s+into\s+["`]?[\w.]+["`]?\s*\(([\S\s]*?)\)\s*values\s*/gi;
const INSERT_SELECT_REGEX = /insert\s+into\s+["`]?[\w.]+["`]?\s*\(([\S\s]*?)\)\s*select\s+/gi;
const UPDATE_REGEX = /update\s+["`]?[\w.]+["`]?\s+set\s+/gi;
const REPLACE_VALUES_REGEX = /replace\s+into\s+["`]?[\w.]+["`]?\s*\(([\S\s]*?)\)\s*values\s*/gi;

// 1. 컬럼 문자열 파싱 ---------------------------------------------------------------------------
export const parseColumns = (columnsStr: string): string[] => {
  const rs = columnsStr
  .split(`,`)
  .map((col) => col.trim().replaceAll(/^["`]|["`]$/g, ``));
  return rs;
};

// 2. VALUES 행의 각 값과 위치 파싱 --------------------------------------------------------------
export const parseRowValues = (rowStr: string): ParsedRowValues => {
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

    const isStringStart = (char === `'` || char === `"`) && !inString;
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
    else if (isStringStart) {
      currentStart === -1 && (currentStart = i);
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
      currentStart === -1 && char.trim() && (currentStart = i);
      char.trim() && (currentEnd = i);
      !inString && char === `(` && parenDepth++;
      !inString && char === `)` && parenDepth--;
      current += char;
    }
  }

  if (current.trim()) {
    values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }

  const rs: ParsedRowValues = {
    values: values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 3. SELECT 컬럼 표현식 파싱 --------------------------------------------------------------------
export const parseSelectColumns = (selectStr: string): ParsedRowValues => {
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

    const isStringStart = (char === `'` || char === `"`) && !inString;
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
    else if (isStringStart) {
      currentStart === -1 && (currentStart = i);
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
      currentStart === -1 && char.trim() && (currentStart = i);
      char.trim() && (currentEnd = i);
      !inString && char === `(` && parenDepth++;
      !inString && char === `)` && parenDepth--;
      current += char;
    }
  }

  if (current.trim()) {
    values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }

  const rs: ParsedRowValues = {
    values: values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 4. VALUES 블록 전체 파싱 ----------------------------------------------------------------------
const parseValuesBlock = (text: string, startPos: number): ValueRow[] => {
  const valueRows: ValueRow[] = [];
  let pos = startPos;
  let inString = false;
  let stringChar = ``;
  let parenDepth = 0;
  let currentRowStart = -1;

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
        parenDepth === 0 && (currentRowStart = pos);
        parenDepth++;
      }
      else if (char === `)`) {
        parenDepth--;
        if (parenDepth === 0 && currentRowStart !== -1) {
          const rowContent = text.slice(currentRowStart + 1, pos);
          const parsed = parseRowValues(rowContent);
          const rowStartPos = currentRowStart + 1;
          valueRows.push({
            values: parsed.values,
            position: rowStartPos,
            valuePositions: parsed.positions.map((p) => rowStartPos + p),
            valueEndPositions: parsed.endPositions.map((p) => rowStartPos + p),
          });
          currentRowStart = -1;
        }
      }
      else if (parenDepth === 0) {
        const remaining = text.slice(Math.max(0, pos)).toUpperCase();
        if (remaining.startsWith(`INSERT`) || char === `;`) {
          break;
        }
      }
    }
    pos++;
  }

  return valueRows;
};

// 5. INSERT INTO ... VALUES 문 검색 -------------------------------------------------------------
export const findInsertValues = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  INSERT_VALUES_REGEX.lastIndex = 0;

  while ((match = INSERT_VALUES_REGEX.exec(text)) !== null) {
    const columnsStr = match[1];
    const valuesStartIdx = match.index + match[0].length;
    const valueRows = parseValuesBlock(text, valuesStartIdx);

    yield {
      columns: parseColumns(columnsStr),
      valueRows: valueRows,
    };
  }
};

// 6. SELECT 컬럼 영역 추출 (FROM 전까지, 서브쿼리 고려) -----------------------------------------
const extractSelectColumns = (text: string, startPos: number): string => {
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
      // parenDepth가 0일 때만 FROM 키워드 확인
      else if (parenDepth === 0) {
        const remaining = text.slice(pos, pos + 10).toUpperCase();
        if (remaining.startsWith(`FROM`) && /^from[\s(]/i.test(remaining)) {
          break;
        }
      }
    }
    pos++;
  }

  const rs = text.slice(startPos, pos);
  return rs;
};

// 7. INSERT INTO ... SELECT 문 검색 -------------------------------------------------------------
export const findInsertSelect = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  INSERT_SELECT_REGEX.lastIndex = 0;

  while ((match = INSERT_SELECT_REGEX.exec(text)) !== null) {
    const columnsStr = match[1];
    const columns = parseColumns(columnsStr);
    const selectContentStart = match.index + match[0].length;

    // SELECT 뒤부터 FROM 전까지 파싱 (서브쿼리 고려)
    const selectStr = extractSelectColumns(text, selectContentStart);
    const parsed = parseSelectColumns(selectStr);

    const valueRows: ValueRow[] = parsed.values.map((value, i) => {
      const relativePos = parsed.positions[i];
      const relativeEndPos = parsed.endPositions[i];
      const absolutePos = relativePos >= 0 ? selectContentStart + relativePos : -1;
      const absoluteEndPos = relativeEndPos >= 0 ? selectContentStart + relativeEndPos : -1;
      const rs: ValueRow = {
        values: [value],
        position: absolutePos,
        valuePositions: [absolutePos],
        valueEndPositions: [absoluteEndPos],
      };
      return rs;
    });

    if (valueRows.length === columns.length) {
      yield {
        columns: columns,
        valueRows: valueRows,
      };
    }
  }
};

// 8. INSERT VALUES 유효성 검사 ------------------------------------------------------------------
export const isValidInsert = (parsed: ParsedInsert): boolean => {
  const hasRows = parsed.valueRows.length > 0;
  const allMatch = parsed.valueRows.every((row) => row.values.length === parsed.columns.length);
  const rs = hasRows && allMatch;
  return rs;
};

// 9. INSERT SELECT 유효성 검사 ------------------------------------------------------------------
export const isValidInsertSelect = (parsed: ParsedInsert): boolean => {
  const rs = parsed.valueRows.length === parsed.columns.length;
  return rs;
};

// 10. UPDATE SET 절 파싱 -----------------------------------------------------------------------
const parseUpdateSet = (setStr: string): ParsedRowValues => {
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

    const isStringStart = (char === `'` || char === `"`) && !inString;
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
      currentCol = current.trim().replaceAll(/^["`]|["`]$/g, ``);
      columns.push(currentCol);
      current = ``;
      currentStart = -1;
      currentEnd = -1;
      beforeEquals = false;
    }
    else if (isStringStart) {
      currentStart === -1 && (currentStart = i);
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
      currentStart === -1 && char.trim() && (currentStart = i);
      char.trim() && (currentEnd = i);
      !inString && char === `(` && parenDepth++;
      !inString && char === `)` && parenDepth--;
      current += char;
    }
  }

  if (current.trim() && !beforeEquals) {
    values.push(current.trim());
    positions.push(currentStart);
    endPositions.push(currentEnd + 1);
  }

  const rs: ParsedRowValues = {
    values: columns.length === values.length ? columns : values,
    positions: positions,
    endPositions: endPositions,
  };
  return rs;
};

// 11. UPDATE 문 검색 ---------------------------------------------------------------------------
export const findUpdateStatements = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  UPDATE_REGEX.lastIndex = 0;

  while ((match = UPDATE_REGEX.exec(text)) !== null) {
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

    const parsed = parseUpdateSet(setContent);
    const columns = parsed.values;
    const valueRows: ValueRow[] = [];

    for (let i = 0; i < columns.length; i++) {
      const relativePos = parsed.positions[i];
      const relativeEndPos = parsed.endPositions[i];
      const absolutePos = relativePos >= 0 ? setStartIdx + relativePos : -1;
      const absoluteEndPos = relativeEndPos >= 0 ? setStartIdx + relativeEndPos : -1;
      valueRows.push({
        values: [columns[i]],
        position: absolutePos,
        valuePositions: [absolutePos],
        valueEndPositions: [absoluteEndPos],
      });
    }

    if (valueRows.length > 0) {
      yield {
        columns: columns,
        valueRows: valueRows,
      };
    }
  }
};

// 12. REPLACE INTO 문 검색 ---------------------------------------------------------------------
export const findReplaceValues = function* (text: string): Generator<ParsedInsert> {
  let match: RegExpExecArray | null;
  REPLACE_VALUES_REGEX.lastIndex = 0;

  while ((match = REPLACE_VALUES_REGEX.exec(text)) !== null) {
    const columnsStr = match[1];
    const valuesStartIdx = match.index + match[0].length;
    const valueRows = parseValuesBlock(text, valuesStartIdx);

    yield {
      columns: parseColumns(columnsStr),
      valueRows: valueRows,
    };
  }
};
