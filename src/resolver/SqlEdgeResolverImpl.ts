import { SqlEdgeResolver, SqlQueryResolver } from './api';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';

export class SqlEdgeResolverImpl extends DelegatingSqlQueryResolver implements SqlEdgeResolver {
  public addCursor(field: string): void {
    this.addField(field, row => this.baseResolver.getCursor(row));
  }

  public addNode(field: string): SqlQueryResolver {
    this.addField(field, this.baseResolver.buildResult.bind(this.baseResolver));
    return this.baseResolver;
  }
}
