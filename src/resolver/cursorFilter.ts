import { Knex } from 'knex';
import { parseCursor, CursorValue } from './cursor';

type QueryBuilderFunc = (builder: Knex.QueryBuilder) => Knex.QueryBuilder;

export interface CursorField {
  name: string;
  qualifiedName: string;
  descending: boolean;
}

export function applyCursorFilter(
  query: Knex.QueryBuilder,
  cursor: string,
  fields: CursorField[],
  before: boolean
): Knex.QueryBuilder {
  if (fields.length > 0) {
    try {
      const cursorFields = parseCursor(cursor);

      let whereFunc: QueryBuilderFunc | undefined;
      const fieldValues: [string, CursorValue][] = [];
      for (const field of fields) {
        const { name, qualifiedName, descending } = field;
        const value = cursorFields[name] ?? null;

        const prevFieldValues = fieldValues.slice();
        fieldValues.push([qualifiedName, value]);

        const operator = (descending && !before) || (!descending && before) ? '<' : '>';
        let fieldFunc: QueryBuilderFunc;
        if (value != null) {
          fieldFunc = (builder) => builder.where(qualifiedName, operator, value);
        } else if (operator === '>') {
          fieldFunc = (builder) => builder.whereNotNull(qualifiedName);
        } else {
          // skip field since nothing sorts before null
          continue;
        }

        if (prevFieldValues.length > 0) {
          const captureFieldFunc = fieldFunc;
          // where(f, v) with v === null -> whereNull(f)
          fieldFunc = (builder) => captureFieldFunc(prevFieldValues.reduce((b, [field, value]) => b.where(field, value), builder));
        }

        if (whereFunc) {
          const captureWhereFunc = whereFunc;
          whereFunc = (builder) => captureWhereFunc(builder).orWhere(fieldFunc);
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
