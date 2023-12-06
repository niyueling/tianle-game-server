/**
 * Created by comet on 16/10/15.
 */
import * as mongoose from 'mongoose';
import findOrCreate from '../plugins/findorcreate';

const globalSchema = new mongoose.Schema({
  _id: String,
  shortIdCounter: {
    type: Number,
    index: true,
    default: 100000,
  },
});

globalSchema.plugin(findOrCreate);

const Global = mongoose.model('Global', globalSchema);
export default Global;
