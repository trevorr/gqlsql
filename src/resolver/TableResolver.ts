import { PropertyDumper } from 'dumpable';
import { FieldResolver } from './FieldResolver';
import { isEquiJoin, JoinSpec, UnionJoinSpec } from './JoinSpec';

export class TableResolver extends FieldResolver {
  protected readonly tableAliases = new Map<string, string>();

  public constructor(
    protected readonly defaultTable: string,
    tableAlias: string,
    private readonly outerResolver?: TableResolver
  ) {
    super();
    this.tableAliases.set(defaultTable, tableAlias);
  }

  public getDefaultTable(): string {
    return this.defaultTable;
  }

  public findTableAlias(table: string): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let resolver: TableResolver | undefined = this;
    let alias;
    do {
      alias = resolver.tableAliases.get(table);
    } while (!alias && (resolver = resolver.outerResolver));
    return alias;
  }

  public getTableAlias(table: string): string {
    const alias = this.findTableAlias(table);
    if (!alias) {
      throw new Error(`Unknown table "${table}"`);
    }
    return alias;
  }

  public qualifyColumn(column: string, table?: string): string {
    return `${this.getTableAlias(table || this.defaultTable)}.${column}`;
  }

  protected resolveJoin<T extends JoinSpec>(join: T): T;
  protected resolveJoin<T extends JoinSpec>(join: T | undefined): T | undefined;
  protected resolveJoin<T extends JoinSpec>(join: T | undefined): T | undefined {
    if (join && isEquiJoin(join) && !join.fromAlias) {
      const fromTable = join.fromTable || this.defaultTable;
      const fromAlias = this.getTableAlias(fromTable);
      join = { ...join, fromTable, fromAlias };
    }
    return join;
  }

  protected resolveJoins(joins: UnionJoinSpec[]): UnionJoinSpec[] {
    return joins.map(join => this.resolveJoin(join));
  }

  protected addTableAlias(table: string, alias: string): void {
    const existing = this.tableAliases.get(table);
    if (existing) {
      throw new Error(`Table "${table}" already aliased as "${alias}"`);
    }
    this.tableAliases.set(table, alias);
  }

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.add('defaultTable', this.defaultTable);
    d.add('tableAliases', this.tableAliases);
    d.addRefIfTruthy('outerResolver', this.outerResolver);
  }
}
