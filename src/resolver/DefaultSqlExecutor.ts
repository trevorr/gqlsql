import { Knex } from 'knex';
import { SqlExecutor } from './api';
import { debug } from './internal';

class DefaultSqlExecutor implements SqlExecutor {
  public async execute<T>(query: Knex.QueryBuilder<any, T>): Promise<T> {
    if (debug.enabled) {
      const sql = query.toSQL();
      debug('Executing SQL: %s %o', sql.sql, sql.bindings);
    }
    return (await query) as T;
  }
}

const defaultSqlExecutor = new DefaultSqlExecutor();

export function getDefaultSqlExecutor(): SqlExecutor {
  return defaultSqlExecutor;
}
