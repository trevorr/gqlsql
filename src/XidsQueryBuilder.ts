import Knex from 'knex';
import { TableMetadata, TypeMetadata } from './meta';
import { resolveQid } from './qid';
import { Row, SqlExecutor } from './resolver';

export class XidsQueryBuilder {
  private readonly tableMeta: TableMetadata;
  private readonly oids: string[];
  private readonly oidColumn: string;
  private readonly query: Knex.QueryBuilder;

  public constructor(
    knex: Knex | Knex.Transaction,
    private readonly sqlExecutor: SqlExecutor,
    private readonly throwNotFound: (description: string | TypeMetadata, id?: string | number) => never,
    private readonly xids: string[],
    meta: TypeMetadata
  ) {
    if (!xids.length) {
      throw new Error('ID array cannot be empty');
    }
    const resolved = xids.map(xid => resolveQid(xid, meta));
    const tableMeta = resolved[0][1];
    const otherMetaIndex = resolved.findIndex(r => r[1] !== tableMeta);
    if (otherMetaIndex >= 0) {
      throw new Error(
        `Cannot resolve IDs of multiple types: ${tableMeta.typeName} and ${resolved[otherMetaIndex][1].typeName}`
      );
    }
    this.oids = resolved.map(r => r[0]);
    const oidColumn = tableMeta.randomIdColumn || tableMeta.wellKnownIdColumn;
    if (!oidColumn) {
      throw new Error(`External ID column not found in metadata for ${tableMeta.typeName}`);
    }
    this.tableMeta = tableMeta;
    this.oidColumn = oidColumn;
    this.query = knex(tableMeta.tableName)
      .select(oidColumn)
      .whereIn(oidColumn, this.oids);
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

  public async getIds(): Promise<(string | number)[]> {
    const rows = await this.selectId().execute();
    const oidIdMap = new Map(rows.map(row => [row[this.oidColumn], row[this.tableMeta.idColumns![0]]]));
    const ids = [];
    for (let i = 0; i < this.oids.length; ++i) {
      const id = oidIdMap.get(this.oids[i]);
      if (id == null) {
        this.throwNotFound(this.tableMeta, this.xids[i]);
      }
      ids.push(id);
    }
    return ids;
  }

  public async execute(): Promise<Row[]> {
    return await this.sqlExecutor.execute<Row[]>(this.query);
  }
}
