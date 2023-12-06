
export const splitCommit = (player, tableState) => {
  const cards = player.cards
  const head = cards.slice(0, 3)
  const middle = cards.slice(3, 8)
  const tail = cards.slice(8, 13)
  return tableState.playerOnCommit(player, {head, middle, tail})
}
