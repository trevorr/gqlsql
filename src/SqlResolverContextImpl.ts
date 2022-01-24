import { Knex } from 'knex';
import { TypeMetadata } from './meta';
import {
  createFactory,
  getDefaultSqlExecutor,
  SqlExecutor,
  SqlResolverFactory,
  SqlResolverOptions,
  UserInputErrorConstructor,
} from './resolver';
import { SqlResolverContext } from './SqlResolverContext';
import { XidQueryBuilder } from './XidQueryBuilder';
import { XidsQueryBuilder } from './XidsQueryBuilder';

class SqlResolverContextImpl implements SqlResolverContext {
  public readonly sqlExecutor: SqlExecutor;
  public readonly userInputError: UserInputErrorConstructor;
  public readonly resolverFactory: SqlResolverFactory;

  public constructor(public readonly knex: Knex, defaultOptions?: Partial<SqlResolverOptions>) {
    this.sqlExecutor = defaultOptions?.sqlExecutor ?? getDefaultSqlExecutor();
    this.userInputError = defaultOptions?.userInputError ?? Error;
    this.resolverFactory = createFactory(knex, defaultOptions);
  }

  public forXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): XidQueryBuilder {
    return new XidQueryBuilder(trx || this.knex, this.sqlExecutor, this.throwNotFound.bind(this), xid, meta);
  }

  public forXids(xids: string[], meta: TypeMetadata, trx?: Knex.Transaction): XidsQueryBuilder {
    return new XidsQueryBuilder(trx || this.knex, this.sqlExecutor, this.throwNotFound.bind(this), xids, meta);
  }

  public async getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string | number>;
  public async getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | number | null | undefined>;
  public async getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | number | null | undefined> {
    return xid && this.forXid(xid, meta, trx).getId();
  }

  public async getIdsForXids(
    xids: string[] | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<(string | number)[] | null | undefined> {
    return xids && xids.length > 0 ? this.forXids(xids, meta, trx).getIds() : undefined;
  }

  public async queryRow(
    query: Knex.QueryBuilder,
    description: string | TypeMetadata = 'Row',
    id?: string | number
  ): Promise<Record<string, any>> {
    const rows = await this.sqlExecutor.execute<any[]>(query);
    if (!rows.length) {
      this.throwNotFound(description, id);
    }
    return rows[0];
  }

  public async queryOptionalRow(query: Knex.QueryBuilder): Promise<Record<string, any>> {
    const rows = await this.sqlExecutor.execute<any[]>(query);
    return rows.length ? rows[0] : {};
  }

  public throwNotFound(description: string | TypeMetadata, id?: string | number): never {
    if (typeof description !== 'string') {
      description = description.typeName;
      if (id) {
        description += ` with ID "${id}"`;
      }
    }
    throw new this.userInputError(`${description} not found`, { code: 'NOT_FOUND', id });
  }

  public extend<Props extends Record<string, unknown>>(props: Props): this & Props {
    return Object.assign(this, props);
  }
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return new SqlResolverContextImpl(knex, defaultOptions);
}
