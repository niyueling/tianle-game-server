import BaseService from "./base";

export default class CardsService extends BaseService {

  /**
   * 获得指定数组的所有组合
   */
  arrayCombine(targetArr = [], count = 1) {
    if (!Array.isArray(targetArr)) return []
    const resultArray = []
    // 所有组合的 01 排列
    const flagArray = this.getFlagArray(targetArr.length, count)
    while (flagArray.length) {
      const flagArr = flagArray.shift()
      resultArray.push(targetArr.filter((_, idx) => flagArr[idx]))
    }
    return resultArray
  }
  /**
   * 获得从 n 中取 m 的所有组合
   * 思路如下：
   * 生成一个长度为 n 的数组，
   * 数组元素的值为 1 表示其下标代表的数被选中，为 0 则没选中。
   *
   * 1. 初始化数组，前 m 个元素置 1，表示第一个组合为前 m 个数；
   * 2. 从左到右扫描数组元素值的 “10” 组合，找到第一个 “10” 组合后将其变为 “01” 组合；
   * 3. 将其左边的所有 “1” 全部移动到数组的最左端
   * 4. 当 m 个 “1” 全部移动到最右端时（没有 “10” 组合了），得到了最后一个组合。
   */
  getFlagArray(n, m = 1) {
    if (m < 1 || n < m)  return []

    // 先生成一个长度为 n 字符串，开头为 m 个 1， 例如“11100”
    let str = '1'.repeat(m) + '0'.repeat(n - m)
    let pos
    // 1
    const resultArray = [Array.from(str, x => Number(x))]
    const keyStr = '10'

    while (str.indexOf(keyStr) > -1) {
      pos = str.indexOf(keyStr)
      // 2
      str = str.replace(keyStr, '01')
      // 3
      str = Array.from(str.slice(0, pos))
        .sort((a, b) => Number(b) - Number(a))
        .join('') + str.slice(pos)
      // 4
      resultArray.push(Array.from(str, x => Number(x)))
    }
    return resultArray
  }
}
