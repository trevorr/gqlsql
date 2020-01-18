import { SqlEdgesResolver, SqlQueryResolver } from './api';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';

export class SqlEdgesResolverImpl extends DelegatingSqlQueryResolver implements SqlEdgesResolver {
  public addCursor(field: string): void {
    this.addField(field, row => this.baseResolver.getCursor(row));
  }

  public addNode(field: string): SqlQueryResolver {
    this.addField(field, this.baseResolver.buildResult.bind(this.baseResolver));
    return this.baseResolver;
  }
}
