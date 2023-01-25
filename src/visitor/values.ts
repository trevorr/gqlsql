import { ValueNode } from 'graphql';
import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';

type VariableValues = Record<string, unknown>;

export function getValue(n: ValueNode, variableValues: VariableValues): unknown {
  switch (n.kind) {
    case 'NullValue':
      return null;
    case 'BooleanValue':
    case 'EnumValue':
    case 'FloatValue':
    case 'IntValue':
    case 'StringValue':
      return n.value;
    case 'ListValue':
      return n.values.map((v) => getValue(v, variableValues));
    case 'ObjectValue':
      return n.fields.reduce((obj: Record<string, unknown>, f) => {
        obj[f.name.value] = getValue(f.value, variableValues);
        return obj;
      }, {});
    case 'Variable':
      return variableValues[n.name.value];
  }
}

export function isTrueValue(value: ValueNode, variableValues: VariableValues): boolean {
  return (
    (value.kind === 'BooleanValue' && value.value === true) ||
    (value.kind === 'Variable' && variableValues[value.name.value] === true)
  );
}

export function resolveArguments(info: GraphQLVisitorInfo): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const args = info.fieldNode.arguments;
  if (args) {
    for (const arg of args) {
      result[arg.name.value] = getValue(arg.value, info.variableValues);
    }
  }
  return result;
}
