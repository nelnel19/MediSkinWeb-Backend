import express from "express";
import SkinHistory from "../models/SkinHistory.js";
import User from "../models/User.js";

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

// GET /api/skin-history/all - Fetch all history across all users
router.get("/all", async (req, res) => {
  try {
    // Fetch all history, sorted by created_at descending
    const allHistory = await SkinHistory.find({})
      .sort({ created_at: -1 })
      .limit(100); // optionally limit

    // Fetch user details for each unique email
    const emails = [...new Set(allHistory.map(h => h.user_id))];
    const users = await User.find({ email: { $in: emails } }).select('email name');
    const userMap = {};
    users.forEach(u => { userMap[u.email] = { name: u.name, email: u.email }; });

    // Attach user info to each history item
    const historyWithUsers = allHistory.map(history => ({
      ...history.toObject(),
      user: userMap[history.user_id] || { email: history.user_id, name: 'Unknown' }
    }));

    res.json({ success: true, history: historyWithUsers });
  } catch (err) {
    console.error("Error fetching all skin history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;