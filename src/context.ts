import Knex from 'knex';
import { SqlExecutor, SqlResolverFactory } from './resolver';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
}
