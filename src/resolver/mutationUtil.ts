import mapObject from 'map-obj';
import { snakeCase } from 'snake-case';

export function hasDefinedElement(arr: unknown[]): boolean {
  return arr.some((v) => v !== undefined);
}

export function hasDefinedValue(obj: { [s: string]: unknown } | ArrayLike<unknown>): boolean {
  return hasDefinedElement(Object.values(obj));
}

export function snakeCaseKeys(obj: object): object {
  return mapObject(obj, (key, value) => [snakeCase(String(key)), value], { deep: true });
}
