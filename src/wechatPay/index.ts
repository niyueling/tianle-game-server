import * as fs from "fs";
import * as request from 'superagent'
import * as uuid from 'uuid'
import * as crypto from 'crypto'
import * as  xml2js from 'xml2js'

type WechatPaymentConfig = {
  appId: string,
  mchId: string,
  key: string,
  serial_no: string,
  certFilePath: string
  keyFilePath: string
}

const XMLbuilder = new xml2js.Builder({
  rootName: 'xml',
  headless: true
})

const xml2JSON = function (xmlString): any {
  return new Promise(function (resolve, reject) {
    xml2js.parseString(xmlString, {
      explicitArray: false
    }, function (err, result) {
      if (err) return reject(err)
      resolve(result)
    })
  })
}


type TransferResponse = {
  return_code: 'FAIL',
  return_msg: string
} | {
  return_code: 'SUCCESS',
  result_code: string
  err_code: string
  err_code_des: string,
  payment_no: string,
  partner_trade_no: string
}


export class WechatPayment {

  private readonly pfxContent: Buffer
  private keyContent: Buffer;
  private certContent: Buffer;

  constructor(readonly config: WechatPaymentConfig) {
    this.certContent = fs.readFileSync(config.certFilePath)
    this.keyContent = fs.readFileSync(config.keyFilePath)
  }


  async transfer(transaction: {
    fromIp: string
    _id: string, openId: string, amountInFen: number, desc: string
  }): Promise<TransferResponse> {
    const transferObject = {

      'mch_appid': this.config.appId,
      mchid: this.config.mchId,
      nonce_str: uuid().slice(0, 20),
      partner_trade_no: transaction._id.toString(),
      check_name: 'NO_CHECK',
      amount: transaction.amountInFen,
      openid: transaction.openId,
      desc: transaction.desc,
      spbill_create_ip: transaction.fromIp,
    }


    const sign = this.md5Sign(this.toSignString(transferObject))
    const xmlBody = XMLbuilder.buildObject({...transferObject, sign})


    const res = await request.post('https://api.mch.weixin.qq.com/mmpaymkttransfers/promotion/transfers')
      .send(xmlBody)
      .cert(this.certContent)
      .key(this.keyContent)
      .set('Content-Type', 'application/xml')


    const resBody = res.text
    console.log(res.text);

    const payRes: { xml: TransferResponse } = await xml2JSON(resBody)

    return payRes.xml
  }

  private toSignString(obj: any) {

    const keys = Object.keys(obj)
      .filter((key) => obj[key]).sort()
      .map((key) => {
        return `${key}=${obj[key]}`
      }).join('&')

    let s = [keys, `key=${this.config.key}`].join('&');
    console.log(s);
    return s
  }

  private hamcSign(text: string) {
    return crypto.createHmac("sha256", this.pfxContent)
      .update(text)
      .digest("hex")
      .toUpperCase();
  }

  private md5Sign(text: string) {
    const hash = crypto.createHash('md5')
    hash.update(text)
    return hash.digest('hex').toUpperCase()
  }

}
