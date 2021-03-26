import Knex from 'knex';
import { TableMetadata, TypeMetadata } from './meta';
import { resolveQid } from './qid';
import { Row, SqlExecutor } from './resolver';

export class XidQueryBuilder {
  private readonly tableMeta: TableMetadata;
  private readonly query: Knex.QueryBuilder;

  public constructor(
    knex: Knex | Knex.Transaction,
    private readonly sqlExecutor: SqlExecutor,
    private readonly throwNotFound: (description: string | TypeMetadata, id?: string | number) => never,
    private readonly xid: string,
    meta: TypeMetadata
  ) {
    let oid, oidColumn;
    if ('wellKnownIdColumn' in meta) {
      this.tableMeta = meta;
      oid = xid;
      oidColumn = meta.wellKnownIdColumn;
    } else {
      [oid, this.tableMeta] = resolveQid(xid, meta);
      oidColumn = this.tableMeta.randomIdColumn;
    }
    if (!oidColumn) {
      throw new Error(`External ID column not found in metadata for ${this.tableMeta.typeName}`);
    }
    this.query = knex(this.tableMeta.tableName).where(oidColumn, oid);
  }

  public configure(config: (query: Knex.QueryBuilder) => void): this {
    config(this.query);
    return this;
  }

  public selectId(): this {
    const { idColumns } = this.tableMeta;
    if (!idColumns) {
      throw new Error(`Internal ID column not found in metadata for ${this.tableMeta.typeName}`);
    }
    this.query.select(idColumns);
    return this;
  }

  public getQuery(): Knex.QueryBuilder {
    return this.query;
  }

  public async lookupId(): Promise<string | number | null> {
    const rows = await this.selectId().execute();
    return rows.length > 0 ? rows[0][this.tableMeta.idColumns![0]] : null;
  }

  public async getId(): Promise<string | number> {
    const rows = await this.selectId().execute();
    if (!rows.length) {
      this.throwNotFound(this.tableMeta, this.xid);
    }
    return rows[0][this.tableMeta.idColumns![0]];
  }

  public async execute(): Promise<Row[]> {
    return await this.sqlExecutor.execute<Row[]>(this.query);
  }

  public async update(data: object | object[]): Promise<number> {
    return await this.sqlExecutor.execute<number>(this.query.update(data));
  }

  public async updateOrThrow(data: object | object[]): Promise<number> {
    const count = this.update(data);
    if (!count) {
      this.throwNotFound(this.tableMeta, this.xid);
    }
    return count;
  }

  public async del(): Promise<number> {
    return await this.sqlExecutor.execute<number>(this.query.del());
  }
}
