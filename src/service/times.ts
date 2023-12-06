import * as moment from "moment/moment";
import BaseService from "./base";

// 时间函数
export default class TimesService extends BaseService {

  // 昨天开始
  startOfYesterdayDate() {
    return moment().subtract( 1, 'days').startOf('day').toDate();
  }

  // 昨天结束
  endOfYesterdayDate() {
    return moment().subtract( 1, 'days').endOf('day').toDate();
  }

  startOfTodayDate() {
    return moment().startOf("day").toDate()
  }
}
