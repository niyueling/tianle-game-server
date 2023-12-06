
import * as mongoose from 'mongoose'
import * as bcrypt from 'bcrypt-nodejs'
import GM from '../src/database/models/gm'

const prod  = require('./config/production')
mongoose.connect(prod.database.url)

//modifySuper username password

const arr = Array.from(process.argv).slice(2)
const username = arr[0]
const password = arr[1]
console.log(username, password)
GM.findOne({username})
  .then(gm => {
    if(!gm){
      console.error('cant find user', username)
      throw Error('NO_SUCH_SUPER_USER')
    }
    gm.username = username
    gm.password = bcrypt.hashSync(password, bcrypt.genSaltSync(8), null)
    return gm.save()
  })
  .then(() => {
    console.log('done');
    process.exit(0)
  })
  .catch(err => {
    console.log(err);
    process.exit(1)
  })


