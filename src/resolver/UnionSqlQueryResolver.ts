import { getNamedType, GraphQLResolveInfo } from 'graphql';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import { Row, SqlUnionQueryResolver } from './api';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import { BaseSqlQueryResolver } from './internal';
import { UnionJoinSpec } from './JoinSpec';
import { TableResolver } from './TableResolver';

export interface UnionTableInfo {
  join: UnionJoinSpec;
  testColumn: string;
}

export class UnionSqlQueryResolver extends DelegatingSqlQueryResolver implements SqlUnionQueryResolver {
  public constructor(
    baseResolver: BaseSqlQueryResolver,
    outerResolver: TableResolver | undefined,
    private readonly tables: UnionTableInfo[]
  ) {
    super(baseResolver, outerResolver);
    for (const table of tables) {
      this.addTableAlias(table.join.toTable, table.join.toAlias!);
    }
    this.addDerivedField('__typename', row => this.getTypeNameFromRow(row));
  }

  public getTypeNameFromRow(row: Row): string | null {
    for (const info of this.tables) {
      if (row[info.testColumn] != null) {
        return info.join.typeName;
      }
    }
    return null;
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

  public walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: (resolver: this) => void,
    options?: WalkOptions
  ): this {
    if (config) {
      config(this);
    }
    const fieldVisitors = this.visitors.union[getNamedType(info.returnType).name];
    if (fieldVisitors) {
      walkSelections(this, info, this.visitors.object, fieldVisitors, options);
    } else {
      walkSelections(this, info, this.visitors.object, undefined, options);
    }
    return this;
  }
}
