/**
 * @file sql.ts
 * @description SQL INSERT 관련 타입 정의
 * @author Jungho
 * @since 2025-12-8
 */

// -------------------------------------------------------------------------------------------------
export interface ValueRow {
	values: string[];
	position: number;
}

// -------------------------------------------------------------------------------------------------
export interface ParsedInsert {
	columns: string[];
	valueRows: ValueRow[];
}

// -------------------------------------------------------------------------------------------------
export interface ColumnMapping {
	columnName: string;
	valuePosition: number;
	valueLength: number;
}
