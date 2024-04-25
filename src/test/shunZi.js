function splitIntoShunzi(numbers) {
  let result = [];
  let currentShunzi = [];

  for (let i = 0; i < numbers.length; i++) {
    if (currentShunzi.length < 2) {
      // 如果当前顺子长度小于2，直接添加
      currentShunzi.push(numbers[i]);
    } else if (currentShunzi.length === 2) {
      // 当前顺子已有2项，判断是否满足相连条件
      if (numbers[i] === currentShunzi[1] + 1) {
        // 第三个数字与前两个数字相连，可以添加到顺子中
        currentShunzi.push(numbers[i]);
      } else {
        // 不相连，则将当前顺子添加到结果中，并开始新的顺子
        result.push(currentShunzi);
        currentShunzi = [numbers[i]];
      }
    } else {
      // 当前顺子已满（3项），开始新的顺子
      result.push(currentShunzi);
      currentShunzi = [numbers[i]];
    }
  }

  // 如果遍历结束后，当前顺子还有元素，则添加到结果中
  if (currentShunzi.length > 0) {
    result.push(currentShunzi);
  }

  return result;
}

// 示例
const shunZi = [1, 2, 3, 4, 5, 6, 12, 13, 14];
const splitShunzi = splitIntoShunzi(shunZi);
console.log(splitShunzi); // 输出应该是: [[1, 2, 3], [4, 5, 6], [12, 13, 14]]

const shunZi1 = [1, 2, 3, 4, 6, 13, 14];
const splitShunzi1 = splitIntoShunzi(shunZi1);
console.log(splitShunzi1); // 输出应该是: [[1, 2, 3], [4, 6], [13, 14]]

const shunZi2 = [1, 2, 3, 12, 13, 15, 16, 17];
const splitShunzi2 = splitIntoShunzi(shunZi2);
console.log(splitShunzi2); // 输出应该是: [[1, 2, 3], [12, 13], [15, 16, 17]]

const shunZi3 = [1, 2, 3, 5, 7, 12, 14, 16, 17, 18];
const splitShunzi3 = splitIntoShunzi(shunZi3);
console.log(splitShunzi3); // 输出应该是: [[1, 2, 3], [12, 13], [15, 16, 17]]
