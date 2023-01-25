import { Knex } from 'knex';
import { SqlExecutor } from './api';
import { debug } from './internal';
import { Row } from './TableSpec';

class DefaultSqlExecutor implements SqlExecutor {
  public async execute<TResult, TRecord extends Row = Row>(
    query: Knex.QueryBuilder<TRecord, TResult>
  ): Promise<TResult> {
    if (debug.enabled) {
      const sql = query.toSQL();
      debug('Executing SQL: %s %o', sql.sql, sql.bindings);
    }
    return (await query) as TResult;
  }
}

const defaultSqlExecutor = new DefaultSqlExecutor();

export function getDefaultSqlExecutor(): SqlExecutor {
  return defaultSqlExecutor;
}
