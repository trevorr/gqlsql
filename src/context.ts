import Knex from 'knex';
import { TypeMetadata } from './meta';
import { getQidTable } from './qid';
import { createFactory, getDefaultSqlExecutor, SqlExecutor, SqlResolverFactory, SqlResolverOptions } from './resolver';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
  getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string>;
  extend<Props extends {}>(props: Props): this & Props;
}

class SqlResolverContextImpl implements SqlResolverContext {
  public readonly sqlExecutor: SqlExecutor;
  public readonly resolverFactory: SqlResolverFactory;

  public constructor(public readonly knex: Knex, defaultOptions?: Partial<SqlResolverOptions>) {
    this.sqlExecutor = getDefaultSqlExecutor();
    this.resolverFactory = createFactory(knex, defaultOptions);
  }

  public async getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string> {
    let objectId, tableMeta, xidColumn;
    if ('stringIdColumn' in meta) {
      objectId = xid;
      tableMeta = meta;
      xidColumn = meta.stringIdColumn;
    } else {
      [objectId, tableMeta] = getQidTable(xid, meta);
      xidColumn = tableMeta.randomIdColumn;
    }
    if (!xidColumn) {
      throw new Error(`External ID column not found in metadata for ${tableMeta.typeName}`);
    }
    const { idColumns } = tableMeta;
    if (!idColumns || idColumns.length !== 1) {
      throw new Error(`Internal ID column not found in metadata for ${tableMeta.typeName}`);
    }
    const query = (trx || this.knex)(tableMeta.tableName)
      .select(idColumns[0])
      .where(xidColumn, objectId);
    const rows = await this.sqlExecutor.execute<any>(query);
    if (!rows.length) {
      throw new Error(`Unknown ${meta.typeName} ID "${xid}"`);
    }
    return rows[0][idColumns[0]];
  }

  public extend<Props extends {}>(props: Props): this & Props {
    return Object.assign(this, props);
  }
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return new SqlResolverContextImpl(knex, defaultOptions);
}
