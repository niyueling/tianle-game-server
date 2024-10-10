export const eqlModelId = (p1, p2) => {
  if (!p1 || !p2) {
    return false
  }
  const stringify = p => {
    let str
    if (p.model) {
      str = p.model._id.toString()
    } else {
      str = typeof p === 'object' ? p.toString() : p
    }
    return str
  }
  return stringify(p1) === stringify(p2)
}

export default o => o.model._id.toString()
export const modelIds = arr => arr.map(p => p.model._id.toString())
