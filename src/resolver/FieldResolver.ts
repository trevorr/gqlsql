import { Dumpable, PropertyDumper } from 'dumpable';
import { Json, JsonObject } from './api';
import { FetchMap, ParentRowMap, ResultBuilder } from './internal';
import { Row } from './TableSpec';

export class FieldResolver<T = Row> extends Dumpable implements ResultBuilder<T> {
  private readonly fieldSources = new Map<
    string,
    ((data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => Json)[]
  >();

  protected addField(field: string, source: (data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap) => Json): this {
    const sources = this.fieldSources.get(field);
    if (!sources) {
      this.fieldSources.set(field, [source]);
    } else {
      sources.push(source);
    }
    return this;
  }

  public addConstantField(field: string, value: Json): this {
    return this.addField(field, () => value);
  }

  public addDerivedField(field: string, func: (data: T) => Json): this {
    return this.addField(field, func);
  }

  protected buildObject(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject {
    const result: JsonObject = {};
    for (const [field, sources] of this.fieldSources.entries()) {
      let value: Json = null;
      for (const source of sources) {
        const sourceValue = source(data, parentRowMap, fetchMap);
        if (sourceValue != null) {
          if (value == null || isOrContainsOnlyEmptyConnections(value)) {
            value = sourceValue;
          } else if (value != sourceValue && !isOrContainsOnlyEmptyConnections(sourceValue)) {
            throw new Error(`Conflicting values for field "${field}"`);
          }
        }
      }
      result[field] = value;
    }
    return result;
  }

  public buildResult(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject | null {
    return this.buildObject(data, parentRowMap, fetchMap);
  }

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.add('fields', this.fieldSources.keys());
  }
}

function isOrContainsOnlyEmptyConnections(value: Json): boolean {
  return (
    isJsonObject(value) &&
    (isEmptyConnection(value) || Object.values(value).every(v => isOrContainsOnlyEmptyConnections(v)))
  );
}

function isJsonObject(value: Json): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyConnection(value: JsonObject): boolean {
  return '__emptyConnection' in value;
}
