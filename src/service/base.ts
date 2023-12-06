// service 层
import * as crypto from "crypto";
import * as request from "superagent";
import * as winston from "winston";

export default class BaseService {
  // 不能用 static 方法
  // 根据 key 获取列表的值
  protected logger: winston.Winston;
  constructor() {
    this.logger = winston;
  }
  getValueFromList(list, key) {
    const result = [];
    for (const r of list) {
      if (r[key]) {
        result.push(r[key])
      }
    }
    return result;
  }

  async postByJson(url, data, header?) {
    if (!header) {
      header = {
        "Accept": 'application/json',
        'Content-Type': 'application/json',
      }
    } else {
      header['Accept'] = 'application/json';
      header['Content-Type'] = 'application/json';
    }
    const resp = await this.curl(url, { method: 'post', headers: header, data });
    resp.data = JSON.parse(resp.data);
    return resp;
  }

  async getByJson(url, header?) {
    if (!header) {
      header = {
        "Accept": 'application/json',
        'Content-Type': 'application/json',
      }
    } else {
      header['Accept'] = 'application/json';
      header['Content-Type'] = 'application/json';
    }
    const resp = await this.curl(url, {method: 'get', headers: header })
    resp.data = JSON.parse(resp.data);
    return resp;
  }

  // 根据 method 发送请求
  async curl(url, opt: {method: string, headers: any, data?: any, pfx?: Buffer, passphrase?: string}) {
    const req = request[opt.method](url);
    if (opt.headers) {
      req.set(opt.headers);
    }
    if (opt.data) {
      req.send(opt.data);
    }
    if (opt.pfx) {
      req.pfx({ pfx: opt.pfx, passphrase: opt.passphrase });
    }
    // 小于 500 以下的不报错
    req.ok(res => res.status < 500);
    const resp = await req;
    if (resp.status !== 200) {
      this.logger.error(`${opt.method} ${url} fail`, resp.text)
    }
    return { status: resp.status, data: resp.text };
  }

  // 生成随机数
  randomStr(len, replaceO0?: boolean) {
    // 生成 len 位字符,  randomBytes 生成的字节数，1个字节8位，则最后转化成16进制（4位）时，为2个字符,所以要除以2
    const s = crypto.randomBytes(len / 2).toString('hex');
    if (replaceO0) {
      // 0变为1， o、O换成A
      return s.replace(/oO/g, 'A').replace(/0/g, '1');
    }
    return s;
  }
}
