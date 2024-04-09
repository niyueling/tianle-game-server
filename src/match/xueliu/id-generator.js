/**
 * Created by user on 2016-07-04.
 */

class IDGenerator {
  constructor(max = 999999, poolCapacity = 10000) {
    this.max = max;
    this.poolCapacity = poolCapacity;
    this.current = 0;
    this.pool = new Set();
    this.extraAllocated = new Set();
  }

  get() {
    if (this.pool.size >= this.poolCapacity) {
      const value = this.pool.values().next().value;
      this.pool.delete(value);
      return value;
    }

    if (this.current + 1 > this.max) {
      return 0;
    }

    ++ this.current;
    while (this.extraAllocated.has(this.current)) {
      ++ this.current;
      if (this.current + 1 > this.max) {
        return 0;
      }
    }

    return this.current;
  }

  getRandom() {
    let num = 0;
    let count = 0;
    do {
      num = Math.floor(Math.random() * ((this.max - this.current) + this.current));
      count += 1;
      if (count > 10000) {
        num = this.get();
        break;
      }
    } while (!this.request(num));
    return num;
  }

  put(x) {
    this.pool.add(x);
  }

  request(id) {
    if (this.pool.has(id)) {
      this.pool.delete(id);
      return true;
    }

    if (id <= this.current) {
      return false;
    }

    if (this.extraAllocated.has(id)) {
      return false;
    }

    this.extraAllocated.add(id);
    return true;
  }
}

export default IDGenerator;
