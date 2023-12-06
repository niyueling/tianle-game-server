/**
 * Created by Color on 2016/7/6.
 */

import alg from '../../utils/algorithm.js';

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  // If you don't care about the order of the elements inside
  // the array, you should sort both arrays here.

  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const MAX_ELEMENT = 1000;

describe('Algorithm', () => {
  describe('#shuffle', () => {
    const originArray = [];
    let shuffled = [];
    before(() => {
      for (let i = 0; i < MAX_ELEMENT; i++) {
        originArray.push(i);
      }
      shuffled = originArray.slice();
      alg.shuffle(shuffled);
    });
    it('should have same length after shuffled.', () => {
      originArray.length.should.equal(shuffled.length);
    });
    it('should have unique elements after shuffled.', () => {
      const unique = shuffled.filter(
        (value, index) => shuffled.indexOf(value) === index
      );
      unique.length.should.equal(shuffled.length);
    });
    it('should not have elements out of range.', () => {
      const checked = shuffled.filter(
        (value) => (value >= 0 && value < MAX_ELEMENT)
      );
      checked.length.should.equal(shuffled.length);
    });
    it('should be a different array after shuffled.', () => {
      arraysEqual(originArray, shuffled).should.not.be.true;
    });
    it('another shuffle should not get the same array.', () => {
      const anotherShuffled = originArray.slice();
      alg.shuffle(anotherShuffled);
      arraysEqual(shuffled, anotherShuffled).should.not.be.true;
    });
  });
});
