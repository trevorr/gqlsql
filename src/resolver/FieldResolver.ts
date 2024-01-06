import { Dumpable, PropertyDumper } from 'dumpable';
import equal from 'fast-deep-equal';
import { Row } from './TableSpec';
import { FetchMap, ParentRowMap, ResultBuilder } from './internal';
import { devMode } from './util';

export class FieldResolver<T = Row> extends Dumpable implements ResultBuilder<T> {
  private readonly fieldSources = new Map<
    string,
    [(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => unknown, string | undefined][]
  >();

  protected addField(
    field: string,
    source: (data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => unknown,
    sourceName = source.name || (devMode ? beautifyStack(new Error().stack) : undefined)
  ): this {
    const sources = this.fieldSources.get(field);
    if (!sources) {
      this.fieldSources.set(field, [[source, sourceName]]);
    } else {
      sources.push([source, sourceName]);
    }
    return this;
  }

  public addConstantField(field: string, value: unknown): this {
    return this.addField(field, () => value, 'constant');
  }

  public addDerivedField(field: string, func: (data: T) => unknown): this {
    return this.addField(field, func);
  }

  protected buildObject(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [field, sources] of this.fieldSources.entries()) {
      let value = null;
      let valueSourceName = null;
      for (const [source, sourceName] of sources) {
        const sourceValue = source(data, parentRowMap, fetchMap);
        if (sourceValue != null) {
          if (value == null || isOrContainsOnlyEmptyConnections(value)) {
            value = sourceValue;
            valueSourceName = sourceName;
          } else if (!equal(value, sourceValue) && !isOrContainsOnlyEmptyConnections(sourceValue)) {
            let message = `Conflicting values for field "${field}": ` + JSON.stringify(value);
            if (valueSourceName) {
              message += ` from "${valueSourceName}"`;
            }
            message += ' != ' + JSON.stringify(sourceValue);
            if (sourceName) {
              message += ` from "${sourceName}"`;
            }
            throw new Error(message);
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

function beautifyStack(stack: string | undefined): string | undefined {
  if (stack) {
    return stack
      .split('\n')
      .filter((line) => line !== 'Error' && !/node:internal/.test(line))
      .map((line) => line.replace(/^\s*at\s+/, ''))
      .join(', ');
  }
  return stack;
}
