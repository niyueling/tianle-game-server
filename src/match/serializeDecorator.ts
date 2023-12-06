import {isNull, isUndefined} from "util";

export function serialize(prototype, key: string) {
  prototype['__needSerializeOProps'] = prototype['__needSerializeOProps'] || []
  prototype['__needSerializeOProps'].push(key)
}

const AutoSerializeKey = '__needAutoSerializeOProps'

export function autoSerialize(prototype, key: string) {
  serialize(prototype, key)
  prototype[AutoSerializeKey] = prototype[AutoSerializeKey] || []
  prototype[AutoSerializeKey].push(key)
}

export interface Serializable {
  toJSON()
}

function tryToJSON(field) {

  if (!isUndefined(field) && !isNull(field)) {
    if (Array.isArray(field)) {
      return field.map(tryToJSON)
    }
    return field.toJSON ? field.toJSON() : field
  }
}

export function autoSerializePropertyKeys(obj: any) {
  return obj.constructor.prototype[AutoSerializeKey]
}

export function serializeHelp(obj: any) {
  const keys = obj.constructor.prototype['__needSerializeOProps']

  const json: any = {}

  for (const k of keys) {
    const field = obj[k]
    json[k] = tryToJSON(field)
  }

  return json
}
