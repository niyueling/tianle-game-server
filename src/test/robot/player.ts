import * as chai from "chai";
import {service} from "../../service/importService";
import {init} from "../base/mockPlayer";

chai.should();
describe('robot player', () => {
  before(async () => {
    await init();
  })
  // after(async () => {
  // })

  it('robot player test', async () => {
    const robotModel = await service.playerService.getRobot(1);
    console.log('robot player', robotModel)
  })
});
