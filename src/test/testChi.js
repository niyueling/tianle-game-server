import Enums from "../match/xmmajiang/enums";

let list = [28, 29, 27].sort().slice();
const baiIndex = list.findIndex(c => c === 27);
if (baiIndex !== -1) {
  list[baiIndex] = Enums.bai;
}

console.log("list-%s", JSON.stringify(list));
