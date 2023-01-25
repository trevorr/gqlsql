import assert from 'assert';
import { Knex } from 'knex';
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
    const [oid, tableMeta] = resolveQid(xid, meta);
    const oidColumn = tableMeta.randomIdColumn || tableMeta.wellKnownIdColumn;
    if (!oidColumn) {
      throw new Error(`External ID column not found in metadata for ${tableMeta.typeName}`);
    }
    this.tableMeta = tableMeta;
    this.query = knex(tableMeta.tableName).where(oidColumn, oid);
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
    if (!rows.length) {
      return null;
    }
    const id = rows[0][this.tableMeta.idColumns[0]];
    assert(typeof id === 'string' || typeof id === 'number');
    return id;
  }

  public async getId(): Promise<string | number> {
    const rows = await this.selectId().execute();
    if (!rows.length) {
      this.throwNotFound(this.tableMeta, this.xid);
    }
    const id = rows[0][this.tableMeta.idColumns[0]];
    assert(typeof id === 'string' || typeof id === 'number');
    return id;
  }

  public async execute(): Promise<Row[]> {
    return await this.sqlExecutor.execute(this.query);
  }

  public async update(data: object | object[]): Promise<number> {
    return await this.sqlExecutor.execute(this.query.update(data));
  }

  public async updateOrThrow(data: object | object[]): Promise<number> {
    const count = this.update(data);
    if (!count) {
      this.throwNotFound(this.tableMeta, this.xid);
    }
    return count;
  }

  public async del(): Promise<number> {
    return await this.sqlExecutor.execute(this.query.del());
  }
}
