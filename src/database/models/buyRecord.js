import * as mongoose from 'mongoose'

const ObjectId = mongoose.Schema.Types.ObjectId

const productSchema = new mongoose.Schema({
  product: {type: ObjectId, required: true},
  productName: {type: String, required: true},
  productPrice: {type: Object, required: true},
  state: {type: String, required: true, default: 'paid'},
  player: {type: String, required: true, ref: 'Player'},
  createAt: {type: Date, required: true, default: Date.now},

  phone: {type: String},
  wechat: {type: String},
  delivery: {type: String}
})

productSchema.index({createAt: -1});
productSchema.index({product: 1});

const Product = mongoose.model('BuyRecord', productSchema)

export default Product
