import * as mongoose from 'mongoose'

const productSchema = new mongoose.Schema({
  name: {type: String, required: true},
  imageUrl: {type: String, required: true},
  onStock: {type: Boolean, required: true, default: true},
  goldPrice: {type: Number, required: true, default: 0},
  rubyPrice: {type: Number, required: true, default: 0},
})

const Product = mongoose.model('Product', productSchema)

export default Product
