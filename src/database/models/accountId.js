import * as mongoose from 'mongoose';
import findOrCreate from '../plugins/findorcreate';

const accountIdSchema = new mongoose.Schema({
  player: {type: String, ref: 'Player'},
  realName: String,
  identifyCode: String
})
accountIdSchema.plugin(findOrCreate);

accountIdSchema.index('identifyCode');
const AccountId = mongoose.model('Account', accountIdSchema);

export default AccountId;
