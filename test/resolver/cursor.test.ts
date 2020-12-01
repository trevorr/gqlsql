import { expect } from 'chai';
import Knex from 'knex';
import { applyCursorFilter, getCursorValue, makeCursor, parseCursor } from '../../src/resolver/cursor';

const knex = Knex({
  client: 'mysql2'
});

describe('getCursorValue', () => {
  it('works', () => {
    expect(getCursorValue(undefined)).to.equal(null);
    expect(getCursorValue(null)).to.equal(null);
    expect(getCursorValue(0)).to.equal(0);
    expect(getCursorValue(new Date(0))).to.equal('1970-01-01 00:00:00.000');
    expect(getCursorValue('')).to.equal('');
    expect(getCursorValue({})).to.equal('[object Object]');
  });
});

describe('makeCursor', () => {
  it('works', () => {
    expect(makeCursor({ a: 'foo', b: 'bar', c: 0, d: new Date(0), e: null }, ['b', 'c', 'd', 'e'])).to.equal(
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000","e":null}').toString('base64')
    );
  });
});

describe('parseCursor', () => {
  it('works', () => {
    expect(
      parseCursor(Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000","e":null}').toString('base64'))
    ).to.eql({ b: 'bar', c: 0, d: '1970-01-01 00:00:00.000', e: null });
  });
});

describe('applyCursorFilter', () => {
  it('handles no sort fields', () => {
    const sql = applyCursorFilter(knex('test'), Buffer.from('{}').toString('base64'), '>', [], []).toSQL();
    expect(sql.sql).to.equal('select * from `test`');
    expect(sql.bindings).to.eql([]);
  });
  it('handles > single field', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      '>',
      ['b'],
      ['b']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`b` > ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles < single field', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      '<',
      ['b'],
      ['b']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`b` < ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles > multiple fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000"}').toString('base64'),
      '>',
      ['b', 'c', 'd'],
      ['b', 'c', 'd']
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`b` > ? or (`b` = ? and `c` > ?) or (`b` = ? and `c` = ? and `d` > ?))'
    );
    expect(sql.bindings).to.eql(['bar', 'bar', 0, 'bar', 0, '1970-01-01 00:00:00.000']);
  });
  it('handles < multiple fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000"}').toString('base64'),
      '<',
      ['b', 'c', 'd'],
      ['b', 'c', 'd']
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`b` < ? or (`b` = ? and `c` < ?) or (`b` = ? and `c` = ? and `d` < ?))'
    );
    expect(sql.bindings).to.eql(['bar', 'bar', 0, 'bar', 0, '1970-01-01 00:00:00.000']);
  });
  it('handles > null prefix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":null,"id":42}').toString('base64'),
      '>',
      ['a', 'b', 'id'],
      ['a', 'b', 'id']
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`a` is not null or (`a` is null and `b` is not null) or (`a` is null and `b` is null and `id` > ?))'
    );
    expect(sql.bindings).to.eql([42]);
  });
  it('handles < null prefix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":null,"id":42}').toString('base64'),
      '<',
      ['a', 'b', 'id'],
      ['a', 'b', 'id']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`a` is null and `b` is null and `id` < ?)');
    expect(sql.bindings).to.eql([42]);
  });
  it('handles > null suffix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":42,"c":null}').toString('base64'),
      '>',
      ['a', 'b', 'c'],
      ['a', 'b', 'c']
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`a` is not null or (`a` is null and `b` > ?) or (`a` is null and `b` = ? and `c` is not null))'
    );
    expect(sql.bindings).to.eql([42, 42]);
  });
  it('handles < null suffix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":42,"c":null}').toString('base64'),
      '<',
      ['a', 'b', 'c'],
      ['a', 'b', 'c']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`a` is null and `b` < ?)');
    expect(sql.bindings).to.eql([42]);
  });
  it('handles > missing cursor fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{}').toString('base64'),
      '>',
      ['x', 'y'],
      ['x', 'y']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`x` is not null or (`x` is null and `y` is not null))');
    expect(sql.bindings).to.eql([]);
  });
  it('handles < missing cursor fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{}').toString('base64'),
      '<',
      ['x', 'y'],
      ['x', 'y']
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where 0 = 1');
    expect(sql.bindings).to.eql([]);
  });
  it('ignores invalid cursor', () => {
    const sql = applyCursorFilter(knex('test'), '!', '>', ['x'], ['x']).toSQL();
    expect(sql.sql).to.equal('select * from `test`');
    expect(sql.bindings).to.eql([]);
  });
});
