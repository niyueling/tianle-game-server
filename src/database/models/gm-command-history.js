/**
 * Created by user on 2016-07-19.
 */
import * as mongoose from 'mongoose';

const schema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    index: true,
  },
  role: {
    type: String,
    required: true,
  },
  command: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});


const GMCommandHistory = mongoose.model('GMCommandHistory', schema);
export default GMCommandHistory;

