import { Knex } from 'knex';
import { TypeMetadata } from './meta';
import { SqlExecutor, SqlResolverFactory, UserInputErrorConstructor } from './resolver';
import { XidQueryBuilder } from './XidQueryBuilder';
import { XidsQueryBuilder } from './XidsQueryBuilder';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  userInputError: UserInputErrorConstructor;
  resolverFactory: SqlResolverFactory;
  forXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): XidQueryBuilder;
  forXids(xids: string[], meta: TypeMetadata, trx?: Knex.Transaction): XidsQueryBuilder;
  getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string | number>;
  getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | number | null | undefined>;
  getIdsForXids(
    xids: string[] | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<(string | number)[] | null | undefined>;
  queryRow(
    query: Knex.QueryBuilder,
    description?: string | TypeMetadata,
    id?: string | number
  ): Promise<Record<string, any>>;
  queryOptionalRow(query: Knex.QueryBuilder): Promise<Record<string, any>>;
  throwNotFound(description: string | TypeMetadata, id?: string | number): never;
  extend<Props extends Record<string, unknown>>(props: Props): this & Props;
}
