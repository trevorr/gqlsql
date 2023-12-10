import { expect } from 'chai';
import Knex from 'knex';
import { CursorField, applyCursorFilter } from '../../src/resolver/cursorFilter';

const knex = Knex({
  client: 'mysql2',
});

function toCursorFields(...columns: string[]): CursorField[] {
  return columns.map((column) => {
    const match = /^((?:\w+\.)?(\w+))(?:\s+(asc|desc))?$/i.exec(column);
    if (!match) {
      throw new Error(`Invalid cursor column: ${column}`);
    }
    const [, qualifiedName, name, dir] = match;
    return { name, qualifiedName, descending: dir?.length === 4 };
  });
}

describe('applyCursorFilter', () => {
  it('handles no sort fields', () => {
    const sql = applyCursorFilter(knex('test'), Buffer.from('{}').toString('base64'), [], false).toSQL();
    expect(sql.sql).to.equal('select * from `test`');
    expect(sql.bindings).to.eql([]);
  });
  it('handles after single field ascending', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      toCursorFields('test.b'),
      false
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`test`.`b` > ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles before single field ascending', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      toCursorFields('test.b'),
      true
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`test`.`b` < ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles after single field descending', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      toCursorFields('test.b desc'),
      false
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`test`.`b` < ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles before single field descending', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar"}').toString('base64'),
      toCursorFields('test.b desc'),
      true
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`test`.`b` > ?)');
    expect(sql.bindings).to.eql(['bar']);
  });
  it('handles after multiple fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000"}').toString('base64'),
      toCursorFields('b', 'c desc', 'd'),
      false
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`b` > ? or (`b` = ? and `c` < ?) or (`b` = ? and `c` = ? and `d` > ?))'
    );
    expect(sql.bindings).to.eql(['bar', 'bar', 0, 'bar', 0, '1970-01-01 00:00:00.000']);
  });
  it('handles before multiple fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000"}').toString('base64'),
      toCursorFields('b', 'c desc', 'd'),
      true
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`b` < ? or (`b` = ? and `c` > ?) or (`b` = ? and `c` = ? and `d` < ?))'
    );
    expect(sql.bindings).to.eql(['bar', 'bar', 0, 'bar', 0, '1970-01-01 00:00:00.000']);
  });
  it('handles after null prefix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":null,"id":42}').toString('base64'),
      toCursorFields('a', 'b', 'id'),
      false
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`a` is not null or (`a` is null and `b` is not null) or (`a` is null and `b` is null and `id` > ?))'
    );
    expect(sql.bindings).to.eql([42]);
  });
  it('handles before null prefix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":null,"id":42}').toString('base64'),
      toCursorFields('a', 'b', 'id'),
      true
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`a` is null and `b` is null and `id` < ?)');
    expect(sql.bindings).to.eql([42]);
  });
  it('handles after null suffix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":42,"c":null}').toString('base64'),
      toCursorFields('a', 'b', 'c'),
      false
    ).toSQL();
    expect(sql.sql).to.equal(
      'select * from `test` where (`a` is not null or (`a` is null and `b` > ?) or (`a` is null and `b` = ? and `c` is not null))'
    );
    expect(sql.bindings).to.eql([42, 42]);
  });
  it('handles before null suffix', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{"a":null,"b":42,"c":null}').toString('base64'),
      toCursorFields('a', 'b', 'c'),
      true
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`a` is null and `b` < ?)');
    expect(sql.bindings).to.eql([42]);
  });
  it('handles after missing cursor fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{}').toString('base64'),
      toCursorFields('x', 'y'),
      false
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where (`x` is not null or (`x` is null and `y` is not null))');
    expect(sql.bindings).to.eql([]);
  });
  it('handles before missing cursor fields', () => {
    const sql = applyCursorFilter(
      knex('test'),
      Buffer.from('{}').toString('base64'),
      toCursorFields('x', 'y'),
      true
    ).toSQL();
    expect(sql.sql).to.equal('select * from `test` where 0 = 1');
    expect(sql.bindings).to.eql([]);
  });
  it('ignores invalid cursor', () => {
    const sql = applyCursorFilter(knex('test'), '!', toCursorFields('x'), false).toSQL();
    expect(sql.sql).to.equal('select * from `test`');
    expect(sql.bindings).to.eql([]);
  });
});
