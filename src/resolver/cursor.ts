import { QueryBuilder } from 'knex';
import { Row } from './TableSpec';

export function makeCursor(row: Row, sortColumns: string[]): string {
  const cursorRow = sortColumns.reduce((acc: Row, val) => {
    acc[val] = String(row[val]);
    return acc;
  }, {});
  return Buffer.from(JSON.stringify(cursorRow)).toString('base64');
}

export function parseCursor(cursor: string): Row {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('ascii'));
}

type OrderOperator = '<' | '>';
type QueryBuilderFunc = (builder: QueryBuilder) => QueryBuilder;

function appendCursorFilter(
  prevFilter: QueryBuilderFunc,
  prevField: string,
  prevValue: any,
  field: string,
  operator: OrderOperator,
  value: any
): QueryBuilderFunc {
  return builder =>
    prevFilter(builder).orWhere(builder => builder.where(prevField, prevValue).andWhere(field, operator, value));
}

export function applyCursorFilter(
  query: QueryBuilder,
  cursor: string,
  operator: OrderOperator,
  sortFields: string[]
): QueryBuilder {
  try {
    const cursorFields = parseCursor(cursor);
    let whereFunc: ((builder: QueryBuilder) => QueryBuilder) | undefined;
    let prevField: string | undefined;
    let prevValue;
    for (const field of sortFields) {
      const value = cursorFields[field];
      if (value == null) break;
      if (whereFunc == null) {
        whereFunc = builder => builder.where(field, operator, value);
      } else {
        whereFunc = appendCursorFilter(whereFunc, prevField!, prevValue, field, operator, value);
      }
      prevField = field;
      prevValue = value;
    }
    if (whereFunc != null) {
      query.where(whereFunc);
    }
  } catch {}
  return query;
}
