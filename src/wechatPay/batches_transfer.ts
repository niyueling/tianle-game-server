import * as crypto from 'crypto'
import * as fs from "fs";
import * as request from 'superagent'
// 抛出
type  Ioptions = {
    userAgent?: string;
    authType?: string;
    key?: string;
    serial_no?: string;
}

type WechatPaymentConfig = {
    appId: string,
    mchId: string,
    key: string,
    serial_no: string,
    certFilePath: string
    keyFilePath: string
  }

export class batches_transfer {
    private userAgent = '127.0.0.1'; // User-Agent
    private appid: string; //  直连商户申请的公众号或移动应用appid。
    private mchid: string; // 商户号
    private serial_no = ''; // 证书序列号
    private publicKey?: Buffer; // 公钥
    private privateKey?: Buffer; // 密钥
    private authType = 'WECHATPAY2-SHA256-RSA2048'; // 认证类型，目前为WECHATPAY2-SHA256-RSA2048

    private key?: string; // APIv3密钥
    public constructor(readonly config: WechatPaymentConfig, optipns?: Ioptions) {

        const _optipns = optipns || {};
        this.appid = this.config.appId;
        this.mchid = this.config.mchId || '';
        this.publicKey = fs.readFileSync(config.certFilePath)
        this.privateKey = fs.readFileSync(config.keyFilePath)

        this.authType = _optipns.authType || 'WECHATPAY2-SHA256-RSA2048';
        this.userAgent = _optipns.userAgent || '127.0.0.1';
        this.key = this.config.key;
        this.serial_no = this.config.serial_no;
        if (!this.publicKey) throw new Error('缺少公钥');
        if (!this.serial_no) throw new Error('缺少证书序列号');

    }

    /**
     * 构建请求签名参数
     * @param method Http 请求方式
     * @param nonce_str
     * @param url 请求接口 例如/v3/certificates
     * @param timestamp 获取发起请求时的系统当前时间戳
     * @param body 请求报文主体
     */
    public getSignature(method: string, nonce_str: string, timestamp: string, url: string, body?: string | Record<string, any>): string {
        let str = method + '\n' + url + '\n' + timestamp + '\n' + nonce_str + '\n';
        if (body && body instanceof Object) body = JSON.stringify(body);
        if (body) str = str + body + '\n';
        if (method === 'GET') str = str + '\n';
        return this.sha256WithRsa(str);
    }
    /**
     * SHA256withRSA
     * @param data 待加密字符
     */
    public sha256WithRsa(data: string): string {
        if (!this.privateKey) throw new Error('缺少秘钥文件');
        return crypto
            .createSign('RSA-SHA256')
            .update(data)
            .sign(this.privateKey.toString(), 'base64');
    }

    /**
     * 获取授权认证信息
     * @param nonce_str
     * @param timestamp 时间戳
     * @param signature 签名值
     */
    public getAuthorization(nonce_str: string, timestamp: string, signature: string): string {
        const _authorization =
            'mchid="' +
            this.mchid +
            '",' +
            'nonce_str="' +
            nonce_str +
            '",' +
            'timestamp="' +
            timestamp +
            '",' +
            'serial_no="' +
            this.serial_no +
            '",' +
            'signature="' +
            signature +
            '"';
        return this.authType.concat(' ').concat(_authorization);
    }

    /**
      * 参数初始化
      */
    private init(method: string, url: string, params?: Record<string, any>) {
        const nonce_str = Math.random()
            .toString(36)
            .substr(2, 15),
            timestamp = parseInt(+new Date() / 1000 + '').toString();

        const signature = this.getSignature(method, nonce_str, timestamp, url.replace('https://api.mch.weixin.qq.com', ''), params);
        return this.getAuthorization(nonce_str, timestamp, signature);
    }

    /**
     * post 请求 V2
     * @param url  请求接口
     * @param params 请求参数
     * @param authorization
     * @param headers
     */
    protected async postRequestV2(url: string, params: Record<string, any>, authorization: string, headers = {}): Promise<object> {
        try {
            const result = await request
                .post(url)
                .send(params)
                .set({
                    ...headers,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': this.userAgent,
                    Authorization: authorization,
                    'Accept-Encoding': 'gzip',
                });
            return {
                status: result.status,
                data: result.body,
            };
        } catch (error) {
            const err = JSON.parse(JSON.stringify(error));
            return {
                status: err.status as number,
                error: err.response.text && JSON.parse(err.response.text),
            };
        }
    }

    /**
       * 发起商家转账零钱
       * @documentation 请看文档https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter4_3_1.shtml
       */
    public async batches_transfer(params: object): Promise<object> {
        const url = 'https://api.mch.weixin.qq.com/v3/transfer/batches';
        // 请求参数
        const _params = {
            appid: this.appid,
            ...params,
        };

        const authorization = this.init('POST', url, _params);

        return await this.postRequestV2(url, _params, authorization, { 'Wechatpay-Serial': this.serial_no });
    }

}
