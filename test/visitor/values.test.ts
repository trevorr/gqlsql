import { expect } from 'chai';
import { FieldNode, Kind, NameNode, ObjectFieldNode, ValueNode, VariableNode } from 'graphql';
import { getValue, GraphQLVisitorInfo, isTrueValue, resolveArguments } from '../../src/visitor';

function makeName(name: string): NameNode {
  return {
    kind: Kind.NAME,
    value: name,
  };
}

function makeVar(name: string): VariableNode {
  return {
    kind: Kind.VARIABLE,
    name: makeName(name),
  };
}

function makeField(name: string, value: ValueNode): ObjectFieldNode {
  return {
    kind: Kind.OBJECT_FIELD,
    name: makeName(name),
    value,
  };
}

describe('getValue', () => {
  it('handles Variable', () => {
    expect(getValue(makeVar('f'), { f: 42 })).to.equal(42);
  });
  it('handles IntValue', () => {
    expect(getValue({ kind: Kind.INT, value: '42' }, {})).to.equal('42');
  });
  it('handles FloatValue', () => {
    expect(getValue({ kind: Kind.FLOAT, value: '3.14' }, {})).to.equal('3.14');
  });
  it('handles StringValue', () => {
    expect(getValue({ kind: Kind.STRING, value: 'hello' }, {})).to.equal('hello');
  });
  it('handles BooleanValue', () => {
    expect(getValue({ kind: Kind.BOOLEAN, value: true }, {})).to.equal(true);
  });
  it('handles NullValue', () => {
    expect(getValue({ kind: Kind.NULL }, {})).to.be.null;
  });
  it('handles EnumValue', () => {
    expect(getValue({ kind: Kind.ENUM, value: 'SOME_VALUE' }, {})).to.equal('SOME_VALUE');
  });
  it('handles ListValue', () => {
    expect(getValue({ kind: Kind.LIST, values: [{ kind: Kind.INT, value: '42' }] }, {})).to.eql(['42']);
  });
  it('handles ObjectValue', () => {
    expect(
      getValue(
        {
          kind: Kind.OBJECT,
          fields: [makeField('f', { kind: Kind.INT, value: '42' })],
        },
        {}
      )
    ).to.eql({ f: '42' });
  });
});

describe('isTrueValue', () => {
  it('handles BooleanValue', () => {
    expect(isTrueValue({ kind: Kind.BOOLEAN, value: false }, {})).to.be.false;
    expect(isTrueValue({ kind: Kind.BOOLEAN, value: true }, {})).to.be.true;
  });
  it('handles Variable', () => {
    expect(isTrueValue(makeVar('f'), { f: false })).to.be.false;
    expect(isTrueValue(makeVar('f'), { f: true })).to.be.true;
    expect(isTrueValue(makeVar('f'), { f: 42 })).to.be.false;
  });
  it('handles other values', () => {
    expect(isTrueValue({ kind: Kind.NULL }, {})).to.be.false;
    expect(isTrueValue({ kind: Kind.INT, value: '42' }, {})).to.be.false;
  });
});

describe('resolveArguments', () => {
  it('handles undefined arguments', () => {
    const info = { fieldNode: {} } as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({});
  });
  it('handles empty arguments', () => {
    const info = {
      fieldNode: { kind: 'Field', name: makeName('f'), arguments: [] } as FieldNode,
    } as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({});
  });
  it('handles actual arguments', () => {
    const info = {
      fieldNode: {
        kind: 'Field',
        name: makeName('f'),
        arguments: [
          { kind: 'Argument', name: makeName('x'), value: { kind: 'IntValue', value: '42' } },
          { kind: 'Argument', name: makeName('y'), value: { kind: 'StringValue', value: 'hi' } },
          { kind: 'Argument', name: makeName('z'), value: { kind: 'Variable', name: makeName('foo') } },
        ],
      } as FieldNode,
      variableValues: {
        foo: 'bar',
      },
    } as any as GraphQLVisitorInfo;
    expect(resolveArguments(info)).to.eql({ x: '42', y: 'hi', z: 'bar' });
  });
});
