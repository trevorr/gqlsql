import Knex from 'knex';
import { createFactory, getDefaultSqlExecutor, SqlExecutor, SqlResolverFactory, SqlResolverOptions } from './resolver';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
  extend<Props extends {}>(props: Props): this & Props;
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return {
    knex,
    sqlExecutor: getDefaultSqlExecutor(),
    resolverFactory: createFactory(knex, defaultOptions),
    extend(props) {
      return Object.assign(this, props);
    }
  };
}
