import express from "express";
import SkinHistory from "../models/SkinHistory.js";

const router = express.Router();

// GET /api/skin-history/:userId
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await SkinHistory.find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(20); // limit to last 20 entries

    res.json({ success: true, history });
  } catch (err) {
    console.error("Error fetching skin history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;