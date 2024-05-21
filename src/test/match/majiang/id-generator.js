/**
 * Created by user on 2016-07-04.
 */
import * as chai from 'chai';
import Generator from '../../../match/id-generator';

chai.should();

describe('Room ID Generator', () => {
  it('should generate id sequence.', () => {
    const generator = new Generator();
    generator.get().should.equal(1);
    generator.get().should.equal(2);
    generator.get().should.equal(3);
  });
  it('should have max id.', () => {
    const generator = new Generator(1);
    generator.get().should.equal(1);
    generator.get().should.equal(0);
    generator.get().should.equal(0);
  });
  it('should get from recycle pool.', () => {
    const generator = new Generator(10, 2);
    generator.get().should.equal(1);
    generator.put(1);
    generator.get().should.equal(2);
    generator.put(2);
    generator.get().should.lessThan(3);
    generator.get().should.equal(3);
  });
  describe('Request ID', () => {
    let generator = null;
    beforeEach(() => { generator = new Generator(10, 2) });
    it('should request id in pool successfully.', () => {
      generator.get().should.equal(1);
      generator.get().should.equal(2);
      generator.put(1);
      generator.put(2);
      generator.request(1).should.be.truthy;
      generator.get().should.equal(3);
    });
    it('should skip requested id.', () => {
      generator.request(2).should.be.truthy;
      generator.request(3).should.be.truthy;
      generator.get().should.equal(1);
      generator.get().should.equal(4);
    });
    it('can not request twice.', () => {
      generator.request(2).should.be.truthy;
      generator.request(2).should.be.falsy;
    });
    it('can not request allocated.', () => {
      generator.get().should.equal(1);
      generator.request(1).should.be.falsy;
    });
  });
});
