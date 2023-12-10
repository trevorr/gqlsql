import { expect } from 'chai';
import {
  formatCursor,
  formatCursorDate,
  getCursorDate,
  getCursorValue,
  makeCursor,
  parseCursor,
} from '../../src/resolver/cursor';

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

describe('getCursorDate', () => {
  it('works', () => {
    expect(getCursorDate(undefined)).to.equal(null);
    expect(getCursorDate(null)).to.equal(null);
    expect(getCursorDate(0)).to.equal(0);
    expect(getCursorDate(new Date(0))).to.equal('1970-01-01 00:00:00.000');
    expect(getCursorDate(new Date(0).toISOString())).to.equal('1970-01-01 00:00:00.000');
    expect(() => getCursorDate('')).to.throw('Invalid time value');
    expect(getCursorDate({})).to.equal(null);
  });
});

describe('formatCursorDate', () => {
  it('works', () => {
    expect(formatCursorDate(new Date(0))).to.equal('1970-01-01 00:00:00.000');
  });
});

describe('formatCursor', () => {
  it('works', () => {
    expect(formatCursor({ b: 'bar', c: 0, d: '1970-01-01 00:00:00.000', e: null })).to.equal(
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

describe('makeCursor', () => {
  it('works', () => {
    expect(makeCursor({ a: 'foo', b: 'bar', c: 0, d: new Date(0), e: null }, ['b', 'c', 'd', 'e'])).to.equal(
      Buffer.from('{"b":"bar","c":0,"d":"1970-01-01 00:00:00.000","e":null}').toString('base64')
    );
  });
});
