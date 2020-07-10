import { QueryBuilder } from 'knex';
import { Row } from './TableSpec';

export function getCursorValue(value: any): string | number {
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    const iso = value.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
    return `${iso.substring(0, 10)} ${iso.substring(11, 23)}`; // YYYY-MM-DD HH:mm:ss.sss
  }
  return String(value);
}

export function makeCursor(row: Row, sortColumns: string[]): string {
  const cursorRow = sortColumns.reduce((acc: Row, val) => {
    acc[val] = getCursorValue(row[val]);
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
  sortFields: string[],
  whereFields: string[]
): QueryBuilder {
  try {
    const cursorFields = parseCursor(cursor);
    let whereFunc: ((builder: QueryBuilder) => QueryBuilder) | undefined;
    let prevField: string | undefined;
    let prevValue;
    for (let i = 0; i < sortFields.length; ++i) {
      const value = cursorFields[sortFields[i]];
      if (value == null) break;
      const field = whereFields[i];
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
