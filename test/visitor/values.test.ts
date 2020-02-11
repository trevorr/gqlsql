import { expect } from 'chai';
import { FieldNode, NameNode, ObjectFieldNode, ValueNode, VariableNode } from 'graphql';
import { getValue, GraphQLVisitorInfo, isTrueValue, resolveArguments } from '../../src/visitor';

function makeName(name: string): NameNode {
  return {
    kind: 'Name',
    value: name
  };
}

function makeVar(name: string): VariableNode {
  return {
    kind: 'Variable',
    name: makeName(name)
  };
}

function makeField(name: string, value: ValueNode): ObjectFieldNode {
  return {
    kind: 'ObjectField',
    name: makeName(name),
    value
  };
}

describe('getValue', () => {
  it('handles Variable', () => {
    expect(getValue(makeVar('f'), { f: 42 })).to.equal(42);
  });
  it('handles IntValue', () => {
    expect(getValue({ kind: 'IntValue', value: '42' }, {})).to.equal('42');
  });
  it('handles FloatValue', () => {
    expect(getValue({ kind: 'FloatValue', value: '3.14' }, {})).to.equal('3.14');
  });
  it('handles StringValue', () => {
    expect(getValue({ kind: 'StringValue', value: 'hello' }, {})).to.equal('hello');
  });
  it('handles BooleanValue', () => {
    expect(getValue({ kind: 'BooleanValue', value: true }, {})).to.equal(true);
  });
  it('handles NullValue', () => {
    expect(getValue({ kind: 'NullValue' }, {})).to.be.null;
  });
  it('handles EnumValue', () => {
    expect(getValue({ kind: 'EnumValue', value: 'SOME_VALUE' }, {})).to.equal('SOME_VALUE');
  });
  it('handles ListValue', () => {
    expect(getValue({ kind: 'ListValue', values: [{ kind: 'IntValue', value: '42' }] }, {})).to.eql(['42']);
  });
  it('handles ObjectValue', () => {
    expect(
      getValue(
        {
          kind: 'ObjectValue',
          fields: [makeField('f', { kind: 'IntValue', value: '42' })]
        },
        {}
      )
    ).to.eql({ f: '42' });
  });
});

describe('isTrueValue', () => {
  it('handles BooleanValue', () => {
    expect(isTrueValue({ kind: 'BooleanValue', value: false }, {})).to.be.false;
    expect(isTrueValue({ kind: 'BooleanValue', value: true }, {})).to.be.true;
  });
  it('handles Variable', () => {
    expect(isTrueValue(makeVar('f'), { f: false })).to.be.false;
    expect(isTrueValue(makeVar('f'), { f: true })).to.be.true;
    expect(isTrueValue(makeVar('f'), { f: 42 })).to.be.false;
  });
  it('handles other values', () => {
    expect(isTrueValue({ kind: 'NullValue' }, {})).to.be.false;
    expect(isTrueValue({ kind: 'IntValue', value: '42' }, {})).to.be.false;
  });
});

describe('resolveArguments', () => {
  it('handles undefined arguments', () => {
    const info = { fieldNode: {} } as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({});
  });
  it('handles empty arguments', () => {
    const info = {
      fieldNode: { kind: 'Field', name: makeName('f'), arguments: [] } as FieldNode
    } as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({});
  });
  it('handles actual arguments', () => {
    const info = ({
      fieldNode: {
        kind: 'Field',
        name: makeName('f'),
        arguments: [
          { kind: 'Argument', name: makeName('x'), value: { kind: 'IntValue', value: '42' } },
          { kind: 'Argument', name: makeName('y'), value: { kind: 'StringValue', value: 'hi' } },
          { kind: 'Argument', name: makeName('z'), value: { kind: 'Variable', name: makeName('foo') } }
        ]
      } as FieldNode,
      variableValues: {
        foo: 'bar'
      }
    } as any) as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({ x: '42', y: 'hi', z: 'bar' });
  });
});
