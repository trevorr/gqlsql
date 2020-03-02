import Knex from 'knex';
import { TableMetadata, TypeMetadata } from './meta';
import { resolveQid, splitQid } from './qid';
import { Row, SqlExecutor } from './resolver';

export class XidsQueryBuilder {
  private readonly tableMeta: TableMetadata;
  private readonly oidColumn: string;
  private readonly query: Knex.QueryBuilder;

  public constructor(
    knex: Knex | Knex.Transaction,
    private readonly sqlExecutor: SqlExecutor,
    private readonly xids: string[],
    meta: TypeMetadata
  ) {
    if (!xids.length) {
      throw new Error('ID array cannot be empty');
    }
    let oids, oidColumn;
    if ('wellKnownIdColumn' in meta) {
      this.tableMeta = meta;
      oids = xids;
      oidColumn = meta.wellKnownIdColumn;
    } else {
      const resolved = xids.map(xid => resolveQid(xid, meta));
      this.tableMeta = resolved[0][1];
      const otherMetaIndex = resolved.findIndex(r => r[1] !== this.tableMeta);
      if (otherMetaIndex >= 0) {
        throw new Error(
          `Cannot resolve IDs of multiple types: ${this.tableMeta.typeName} and ${resolved[otherMetaIndex][1].typeName}`
        );
      }
      oids = resolved.map(r => r[0]);
      oidColumn = this.tableMeta.randomIdColumn;
    }
    if (!oidColumn) {
      throw new Error(`External ID column not found in metadata for ${this.tableMeta.typeName}`);
    }
    this.oidColumn = oidColumn;
    this.query = knex(this.tableMeta.tableName)
      .select(oidColumn)
      .whereIn(oidColumn, oids);
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

  public async getIds(): Promise<string[]> {
    const rows = await this.selectId().execute();
    const oidIdMap = new Map(rows.map(row => [row[this.oidColumn], row[this.tableMeta.idColumns![0]]]));
    const ids = [];
    for (const xid of this.xids) {
      const id = oidIdMap.get(splitQid(xid)[0]);
      if (id == null) {
        throw new Error(`Unknown ${this.tableMeta.typeName} ID "${xid}"`);
      }
      ids.push(id);
    }
    return ids;
  }

  public async execute(): Promise<Row[]> {
    return await this.sqlExecutor.execute<Row[]>(this.query);
  }
}
