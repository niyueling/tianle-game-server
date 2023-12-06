/**
 * Created by Color on 2016/7/6.
 */
const algorithm = {
  shuffleForZhadan: function (arr) {
    const rand = randWithSeed();
    const array = arr;
    let maxIndex = arr.length - 1;
    const originalLen = arr.length;
    while (maxIndex > 0) {
      const randIndex = Math.floor(Math.random() * rand() * originalLen);
      const t = arr[maxIndex];
      array[maxIndex] = arr[randIndex];
      array[randIndex] = t;
      maxIndex--;
    }
  },
  shuffle: function (arr) {
    // 当前时间做种子
    const seedStr = Date.now().toString();
    for (let i = arr.length - 1; i > 0; i--) {
      const rand = randWithSeed(seedStr + i);
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },
  // 从 0 开始，随机取一个小于 max 的整数
  randomIntLessMax(max, randFunc) {
    if (!randFunc) {
      randFunc = randWithSeed();
    }
    return Math.floor(randFunc() * max);
  },
  // 在最小数，最大数中随机选一个(包括最大、最小值)
  randomIntBetweenNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  // 从列表中随机选一个
  randomPickFromArray(list) {
    const randomIndex = this.randomIntLessMax(list.length)
    return list[randomIndex];
  },

  //返回随机种子
  randomBySeed() {
    const seedStr = Date.now().toString();
    const rand = randWithSeed(seedStr);
    return rand();
  }
}


Array.prototype.contains = function (e) {
  for (let i = 0; i < this.length; i++) {
    if (this[i] === e) {
      return true;
    }
  }
  return false;
};


Array.prototype.remove = function (e) {
  for (let i = 0; i < this.length; i++) {
    if (this[i] === e) {
      this.splice(i, 1);
      return true;
    }
  }
  return false;
};

Array.prototype.removeFilter = function (match) {
  for (let i = 0; i < this.length; i++) {
    if (match(this[i])) {
      this.splice(i, 1);
      return true;
    }
  }
  return false;
};

Array.prototype.filterCount = function (match) {
  let sum = 0;
  for (let i = 0; i < this.length; i++) {
    if (match(this[i])) {
      sum++;
    }
  }
  return sum;
};

Array.prototype.all = function (match) {
  for (let i = 0; i < this.length; i++) {
    if (!match(this[i])) {
      return false;
    }
  }
  return true;
};

/**
 * 精确加法
 * https://github.com/camsong/blog/issues/9
 */
export function accAdd(num1, num2) {
  const num1Digits = (num1.toString().split('.')[1] || '').length;
  const num2Digits = (num2.toString().split('.')[1] || '').length;
  const baseNum = Math.pow(10, Math.max(num1Digits, num2Digits));
  return (num1 * baseNum + num2 * baseNum) / baseNum;
}

export default algorithm;

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
// for example
// const rand = randWithSeed();
// console.log(rand())
export function randWithSeed(seedStr) {
  if (!seedStr) {
    // 当前时间做种子
    seedStr = Date.now().toString();
  }
  const seed = cyrb128(seedStr);
  // // Four 32-bit component hashes provide the seed for sfc32.
  // const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
  // Only one 32-bit component hash is needed for mulberry32.
  return mulberry32(seed[0]);
}

// 新随机数
// 随机数种子
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277,
    h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// 另一个随机生成数
function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}
