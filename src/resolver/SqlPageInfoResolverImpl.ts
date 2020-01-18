import { SqlPageInfoResolver } from './api';
import { FieldResolver } from './FieldResolver';
import { FetchResult } from './internal';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';

export class SqlPageInfoResolverImpl extends FieldResolver<FetchResult> implements SqlPageInfoResolver {
  private readonly nodeResolver: KnexSqlQueryResolver;

  public constructor(nodeResolver: KnexSqlQueryResolver) {
    super();
    this.nodeResolver = nodeResolver;
  }

  public addHasPreviousPage(field: string): void {
    this.addField(field, data => data.hasPreviousPage || false);
  }

  public addHasNextPage(field: string): void {
    this.addField(field, data => data.hasNextPage || false);
  }

  public addStartCursor(field: string): void {
    this.addField(field, data =>
      data.rows.length > 0 ? this.nodeResolver.getCursor(data.rows[0]) : data.afterCursor || null
    );
  }

  public addEndCursor(field: string): void {
    this.addField(field, data =>
      data.rows.length > 0 ? this.nodeResolver.getCursor(data.rows[data.rows.length - 1]) : data.beforeCursor || null
    );
  }
}
