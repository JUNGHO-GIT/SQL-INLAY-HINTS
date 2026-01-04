/**
 * @file sql.ts
 * @description SQL INSERT 관련 타입 정의
 * @author Jungho
 * @since 2025-12-8
 */

// 1. VALUES 행 데이터 ---------------------------------------------------------------------------
export interface ValueRow {
  values: string[];
  position: number;
  valuePositions: number[];
  valueEndPositions: number[];
}

// 2. 파싱된 INSERT 문 전체 구조 -----------------------------------------------------------------
export interface ParsedInsert {
  columns: string[];
  valueRows: ValueRow[];
}

// 3. 파싱된 값과 위치 정보 ---------------------------------------------------------------------
export interface ParsedRowValues {
  values: string[];
  positions: number[];
  endPositions: number[];
}
