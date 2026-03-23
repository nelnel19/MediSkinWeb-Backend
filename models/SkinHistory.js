import mongoose from "mongoose";

const skinHistorySchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  image_url: { type: String, required: true },
  prediction: {
    disease: String,
    confidence: Number,
    description: String,
    warning: String,
    medication_info: {
      has_medications: Boolean,
      medications: Array,
      general_advice: Array
    }
  },
  created_at: { type: Date, default: Date.now }
}, { collection: 'skin_history' }); // matches your existing collection

const SkinHistory = mongoose.model("SkinHistory", skinHistorySchema);
export default SkinHistory;