import { describe, expect, test } from "bun:test";
import { fndInsrSlct } from "./Parser";

// 1. 복합 INSERT SELECT 파싱 -------------------------------------------------------------------
describe(`complex INSERT SELECT`, () => {
  test(`keeps comments out of the projection grammar`, () => {
    const sql = `INSERT INTO dst (a, b) SELECT a /*, FROM fake */, b --, fake\nFROM src;`;
    const parsed = [...fndInsrSlct(sql)];

    expect(parsed).toHaveLength(1);
    expect(parsed[0].valueRows.map((row) => row.values[0])).toEqual([`a /*, FROM fake */`, `b --, fake`]);
  });

  test(`supports a CTE between the target columns and SELECT`, () => {
    const sql = `INSERT INTO dst (a, b) WITH q AS (SELECT a, b FROM src) SELECT q.a, q.b FROM q;`;
    const parsed = [...fndInsrSlct(sql)];

    expect(parsed).toHaveLength(1);
    expect(parsed[0].valueRows.map((row) => row.values[0])).toEqual([`q.a`, `q.b`]);
  });

  test(`maps every UNION branch`, () => {
    const sql = `INSERT INTO dst (a, b) SELECT a, b FROM first_src UNION ALL SELECT c, d FROM second_src;`;
    const parsed = [...fndInsrSlct(sql)];

    expect(parsed).toHaveLength(2);
    expect(parsed.map((item) => item.valueRows.map((row) => row.values[0]))).toEqual([[`a`, `b`], [`c`, `d`]]);
  });

  test(`preserves nested expressions and window functions`, () => {
    const sql = `INSERT INTO dst (a, b, c, d) SELECT COALESCE(s.a, 0), (SELECT MAX(x.v) FROM x WHERE x.id = s.id), CASE WHEN s.ok = 1 THEN 'Y' ELSE 'N' END, ROW_NUMBER() OVER (PARTITION BY s.g ORDER BY s.id) FROM src s;`;
    const parsed = [...fndInsrSlct(sql)];

    expect(parsed).toHaveLength(1);
    expect(parsed[0].valueRows).toHaveLength(4);
  });
});
