import { QueryBuilder } from 'knex';
import { Row } from './TableSpec';

export type CursorValue = string | number | null;

export function getCursorValue(value: any): CursorValue {
  if (value == null) {
    return null;
  }
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

export function parseCursor(cursor: string): Record<string, CursorValue> {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('ascii'));
}

type OrderOperator = '<' | '>';
type QueryBuilderFunc = (builder: QueryBuilder) => QueryBuilder;

export function applyCursorFilter(
  query: QueryBuilder,
  cursor: string,
  operator: OrderOperator,
  sortFields: string[],
  whereFields: string[]
): QueryBuilder {
  if (sortFields.length > 0) {
    try {
      const cursorFields = parseCursor(cursor);

      let whereFunc: QueryBuilderFunc | undefined;
      const fieldValues: [string, CursorValue][] = [];
      for (let i = 0; i < sortFields.length; ++i) {
        const value = cursorFields[sortFields[i]] ?? null;
        const field = whereFields[i];

        const prevFieldValues = fieldValues.slice();
        fieldValues.push([field, value]);

        let fieldFunc: QueryBuilderFunc;
        if (value != null) {
          fieldFunc = builder => builder.where(field, operator, value);
        } else if (operator === '>') {
          fieldFunc = builder => builder.whereNotNull(field);
        } else {
          // skip field since nothing sorts before null
          continue;
        }

        if (prevFieldValues.length > 0) {
          const captureFieldFunc = fieldFunc;
          // where(f, v) with v === null -> whereNull(f)
          fieldFunc = builder =>
            captureFieldFunc(prevFieldValues.reduce((b, [field, value]) => b.where(field, value), builder));
        }

        if (whereFunc) {
          const captureWhereFunc = whereFunc;
          whereFunc = builder => captureWhereFunc(builder).orWhere(fieldFunc);
        } else {
          whereFunc = fieldFunc;
        }
      }

      if (whereFunc) {
        query.where(whereFunc);
      } else {
        // all fields < null
        query.whereRaw('0 = 1');
      }
    } catch {
      // ignore invalid cursor
    }
  }
  return query;
}
