import { Dumpable, PropertyDumper } from 'dumpable';
import equal from 'fast-deep-equal';
import { FetchMap, ParentRowMap, ResultBuilder } from './internal';
import { Row } from './TableSpec';

export class FieldResolver<T = Row> extends Dumpable implements ResultBuilder<T> {
  private readonly fieldSources = new Map<
    string,
    ((data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => unknown)[]
  >();

  protected addField(
    field: string,
    source: (data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => unknown
  ): this {
    const sources = this.fieldSources.get(field);
    if (!sources) {
      this.fieldSources.set(field, [source]);
    } else {
      sources.push(source);
    }
    return this;
  }

  public addConstantField(field: string, value: unknown): this {
    return this.addField(field, () => value);
  }

  public addDerivedField(field: string, func: (data: T) => unknown): this {
    return this.addField(field, func);
  }

  protected buildObject(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [field, sources] of this.fieldSources.entries()) {
      let value = null;
      for (const source of sources) {
        const sourceValue = source(data, parentRowMap, fetchMap);
        if (sourceValue != null) {
          if (value == null || isOrContainsOnlyEmptyConnections(value)) {
            value = sourceValue;
          } else if (!equal(value, sourceValue) && !isOrContainsOnlyEmptyConnections(sourceValue)) {
            throw new Error(`Conflicting values for field "${field}"`);
          }
        }
      }
      result[field] = value;
    }
    return result;
  }

  public buildResult(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): Record<string, unknown> | null {
    return this.buildObject(data, parentRowMap, fetchMap);
  }

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.add('fields', this.fieldSources.keys());
  }
}

function isOrContainsOnlyEmptyConnections(value: unknown): boolean {
  return (
    isRecord(value) &&
    (isEmptyConnection(value) || Object.values(value).every((v) => isOrContainsOnlyEmptyConnections(v)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyConnection(value: Record<string, unknown>): boolean {
  return '__emptyConnection' in value;
}
