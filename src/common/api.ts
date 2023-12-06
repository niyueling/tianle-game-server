export function addApi(opt?: { apiName?: string, rule?: object, resp?: object }) {
  // 检查参数
  let apiName = '';
  let rule = null;
  if (opt && opt.apiName) {
    // 没有接口名
    apiName = opt.apiName;
  }
  if (opt && opt.rule) {
    rule = opt.rule;
  }
  return function (target, name, descriptor) {
    if (!apiName) {
      // 设置为接口名
      apiName = name;
    }
    if (!target.__apiMap) {
      target.__apiMap = new Map();
    }
    if (!target.__apiRule) {
      target.__apiRule = new Map();
    }
    target.__apiMap.set(apiName, name);
    // 不校验参数
    if (!rule) {
      return descriptor;
    }
    target.__apiRule.set(apiName, rule);
    return descriptor;
  }
}
