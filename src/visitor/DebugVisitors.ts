import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';
import { resolveArguments } from './values';
import { FieldVisitors, RecursiveVisitor, TypeVisitors } from './visitors';
import { getResponseKey } from './walk';

function getFieldVisitors(type: string): FieldVisitors {
  return new Proxy(
    {},
    {
      has(): boolean {
        return true;
      },
      get(_, p: string | number | symbol): RecursiveVisitor<number> {
        return (context: number, info: GraphQLVisitorInfo): number => {
          const method = String(p);
          if (!method.endsWith('After')) {
            const indent = '  '.repeat(context);
            const { fieldNode } = info;
            const key = getResponseKey(fieldNode);
            const args = JSON.stringify(resolveArguments(info));
            const fieldType = info.returnType.toString();
            console.log(`${indent}${type}.${method}: ${key} = ${fieldNode.name.value}(${args}): ${fieldType}`);
          }
          return context + 1;
        };
      },
    }
  );
}

function getTypeVisitors(): TypeVisitors {
  return new Proxy(
    {},
    {
      has(): boolean {
        return true;
      },
      get(_, p: string | number | symbol): FieldVisitors {
        return getFieldVisitors(String(p));
      },
    }
  );
}

export default getTypeVisitors();
