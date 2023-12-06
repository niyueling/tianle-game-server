import * as chai from "chai";
import * as chaiProperties from 'chai-properties'
import clubHandler from '../../../player/message-handlers-rmq/club'
import {ClubAction} from "../../../player/message-handlers-rmq/club";

chai.use(chaiProperties)
describe('战队', () => {
  it('创建战队', async () => {
    await clubHandler[ClubAction.rename](
      {}, {newClubName: 'demo'}
    )
  })
})
