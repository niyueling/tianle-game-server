let list = [28, 29, 27].sort();
const baiIndex = list.findIndex(c => c === 27);
if (baiIndex !== -1) {
  list[baiIndex] = 37;
}
index = list.indexOf(29);
list[index] = 29;
list.push(29);

console.log("list-%s", JSON.stringify(list));
