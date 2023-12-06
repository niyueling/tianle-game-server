/**
 * Created by comet on 16/10/15.
 */
import * as mongoose from 'mongoose';
import findOrCreate from '../plugins/findorcreate';

const globalSchema = new mongoose.Schema({
  type: String,
  shortIdCounter: {
    type: Number,
    default: 100000,
  },
});


const ClubGlobal = mongoose.model('ClubGlobal', globalSchema);
export default ClubGlobal;
