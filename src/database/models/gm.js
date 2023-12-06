/**
 * Created by user on 2016-07-19.
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt-nodejs';

import findOrCreate from '../plugins/findorcreate';
const ObjectId = mongoose.Schema.ObjectId

const gmSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enums: ['super', 'level1', 'level2'],
    required: true,
    default: 'super'
  },
  superior: {
    type: ObjectId,
    ref: 'GM'
  },
  gold: {
    type: Number,
    default: 0
  },
  gem: {
    type: Number,
    default: 0
  },
  spendGold: {
    type: Number,
    default: 0
  },
  spendGem: {
    type: Number,
    default: 0
  },
  relation: {type: [ObjectId], ref: 'GM', default: []},
  inviteCode: {
    type: String,
    unique: true
  },
  gemKickback: {type: Number, default: 0},
  cashKickback: {type: Number, default: 0}
});

gmSchema.plugin(findOrCreate);
gmSchema.methods.addRole = function addRole(role) {
  if (!this.hasRole(role)) {
    this.roles.push(role);
  }
};

gmSchema.methods.removeRole = function removeRole(role) {
  const index = this.roles.indexOf(role);
  if (index !== -1) {
    this.roles.splice(index, 1);
  }
};

gmSchema.methods.hasRole = function hasRole(role) {
  // const index = this.roles.indexOf(role);
  // return index !== -1;
  return this.role == role
};

gmSchema.statics.generateHash = function generateHash(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

gmSchema.methods.validPassword = function validPassword(password) {
  return bcrypt.compareSync(password, this.password);
}

gmSchema.pre('save', function (next) {
  if (!this.inviteCode)
    this.inviteCode = String(Date.now()).slice(-6)

  next()
})

const GM = mongoose.model('GM', gmSchema);
export default GM;

