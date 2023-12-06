import * as path from "path";
import {WechatPayment} from "../../../wechatPay";
import * as uuid from 'uuid'
import {expect} from "chai";

describe('微信企业转账到零钱包', () => {


  // 测试一次3毛,手动测试
  it.skip('转账给我', async () => {

    const api = new WechatPayment({
      certFilePath: path.join(__dirname, '../../../../apiclient_cert.pem'),
      keyFilePath: path.join(__dirname, '../../../../apiclient_key.pem'),
      mchId: '1484235792',
      serial_no:"5D9A17286800617024A05A88C9DCACD12298D8F2",
      appId: 'wxaa2b6f1e0d153e1e',
      key: 'YdrTlPqPXYqhOwWGaXKsqum6ZrKzKRG1'
    })

    const res = await api.transfer({
      _id: uuid().replace(/-/g, ''),
      desc: '测试打款',
      fromIp: '192.168.2.211',
      openId: 'oCqFn1lMeoeR9zM5amYSGJAR4m58',
      amountInFen: 30
    })


    expect(res.return_code).to.equal('SUCCESS')
    if (res.return_code === "SUCCESS") {
      expect(res.result_code).to.equal("SUCCESS")
    }

  })

})
