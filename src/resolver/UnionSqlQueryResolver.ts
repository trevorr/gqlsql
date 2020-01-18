import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import { BaseSqlQueryResolver } from './internal';
import { TableResolver } from './TableResolver';
import { UnionJoinSpec } from './JoinSpec';

export interface UnionTableInfo {
  join: UnionJoinSpec;
  testColumn: string;
}

export class UnionSqlQueryResolver extends DelegatingSqlQueryResolver {
  public constructor(
    baseResolver: BaseSqlQueryResolver,
    outerResolver: TableResolver | undefined,
    private readonly tables: UnionTableInfo[]
  ) {
    super(baseResolver, outerResolver);
    for (const table of tables) {
      this.addTableAlias(table.join.toTable, table.join.toAlias!);
    }
    this.addDerivedField('__typename', row => {
      for (const info of tables) {
        if (row[info.testColumn] != null) {
          return info.join.typeName;
        }
      }
      return null;
    });
  }

  public addSelectColumn(
    column: string,
    tables: string | string[] = this.tables.map(info => info.join.toTable)
  ): string {
    if (!Array.isArray(tables)) {
      return super.addSelectColumn(column, tables);
    }

    return this.addSelectColumnFromAlias(
      column,
      tables.map(table => this.getTableAlias(table))
    );
  }

  public addSelectColumnFromAlias(column: string, tableAliases: string | string[]): string {
    if (!Array.isArray(tableAliases)) {
      tableAliases = [tableAliases];
    }

    let sql = 'coalesce(';
    let nextParam = '??.??';
    const bindings = [];
    for (const table of tableAliases) {
      sql += nextParam;
      bindings.push(table, column);
      nextParam = ', ??.??';
    }
    sql += ')';
    return this.baseResolver.addSelectExpression(this.baseResolver.getKnex().raw(sql, bindings), column);
  }

  public addOrderBy(column: string, tables?: string | string[], descending = false): this {
    this.baseResolver.addOrderBy(this.addSelectColumn(column, tables), undefined, descending);
    return this;
  }
}
