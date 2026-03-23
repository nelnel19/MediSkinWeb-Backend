import express from "express";
import SkinHistory from "../models/SkinHistory.js";

const router = express.Router();

// GET all skin analysis history (for admin or testing)
router.get("/all", async (req, res) => {
  try {
    console.log("📡 Fetching all skin history...");
    const allHistory = await SkinHistory.find({})
      .sort({ created_at: -1 })
      .limit(100);
    console.log(`✅ Found ${allHistory.length} history entries`);
    res.json({ success: true, history: allHistory });
  } catch (err) {
    console.error("❌ Error fetching all skin history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET history for a specific user (by email)
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await SkinHistory.find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(20);
    res.json({ success: true, history });
  } catch (err) {
    console.error("Error fetching user skin history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;