import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  imageHash: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  // Store the complete analysis result from any face/skin analysis API
  analysisData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // These are optional - can be extracted from analysisData
  skinGrade: {
    type: mongoose.Schema.Types.Mixed, // Can be string or object
    default: 'Unknown'
  },
  overallCondition: {
    type: String,
    default: 'Unknown'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  strict: false // Allow flexible schema for nested objects
});

// Compound index to prevent duplicate analyses
historySchema.index({ userEmail: 1, imageHash: 1 }, { unique: true });

export default mongoose.model("History", historySchema);