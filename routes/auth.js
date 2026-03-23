import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// REGISTER (existing code remains the same)
router.post("/register", upload.single('profileImage'), async (req, res) => {
  try {
    const { name, email, password, age, birthday, gender } = req.body;

    if (!name || !email || !password || !age || !birthday || !gender)
      return res.status(400).json({ message: "All fields are required" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    
    let profileImage = {};
    
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      
      const uploadResult = await cloudinary.uploader.upload(dataURI, {
        folder: "mediskin/profiles",
        transformation: [
          { width: 500, height: 500, crop: "limit" },
          { quality: "auto" },
          { format: "webp" }
        ]
      });
      
      profileImage = {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url
      };
    }

    const user = new User({ 
      name, 
      email, 
      password: hashed, 
      age, 
      birthday,
      gender,
      profileImage 
    });
    
    await user.save();

    res.json({ 
      message: "Registered successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        birthday: user.birthday,
        gender: user.gender,
        profileImage: user.profileImage,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// LOGIN (existing code remains the same)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Incorrect password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    
    res.json({ 
      message: "Login successful", 
      token, 
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        birthday: user.birthday,
        gender: user.gender,
        profileImage: user.profileImage,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE PROFILE (existing code remains the same)
router.put("/update/:id", upload.single('profileImage'), async (req, res) => {
  try {
    const { name, email, password, age, birthday, gender } = req.body;
    const updates = { name, email, age, birthday, gender };

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    if (req.file) {
      const user = await User.findById(req.params.id);
      
      if (user.profileImage && user.profileImage.public_id) {
        await cloudinary.uploader.destroy(user.profileImage.public_id);
      }

      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      
      const uploadResult = await cloudinary.uploader.upload(dataURI, {
        folder: "mediskin/profiles",
        transformation: [
          { width: 500, height: 500, crop: "limit" },
          { quality: "auto" },
          { format: "webp" }
        ]
      });
      
      updates.profileImage = {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    res.json({ 
      message: "Profile updated successfully", 
      user: updatedUser 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET USER PROFILE (existing code remains the same)
router.get("/profile/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL USERS (existing code remains the same)
router.get("/all", async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      count: users.length,
      users 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// NEW ENDPOINT: GET WEEKLY USER STATISTICS - FIXED VERSION
router.get("/weekly-stats", async (req, res) => {
  try {
    console.log("📊 WEEKLY STATS API CALLED");
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
    
    // Get start of 7 days ago (midnight)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);
    
    console.log("Query range:");
    console.log("Start of week (7 days ago):", startOfWeek.toString());
    console.log("End (today start):", today.toString());
    console.log("Now (current time):", now.toString());
    
    // Get ALL users to see what we have
    const allUsers = await User.find({}, 'createdAt name email').sort({ createdAt: 1 });
    console.log(`\n📈 TOTAL USERS IN SYSTEM: ${allUsers.length}`);
    allUsers.forEach((user, index) => {
      const userDate = new Date(user.createdAt);
      const localDate = userDate.toLocaleString();
      console.log(`User ${index + 1}: ${user.name || 'No name'} - ${user.email} - Created: ${localDate}`);
    });
    
    // Get users created in the last 7 days (INCLUSIVE of start date)
    const recentUsers = await User.find({
      createdAt: { 
        $gte: startOfWeek,
        $lte: now // Use current time, not start of today
      }
    }, 'createdAt name').sort({ createdAt: 1 });
    
    console.log(`\n🔍 USERS IN LAST 7 DAYS: ${recentUsers.length}`);
    recentUsers.forEach((user, index) => {
      const userDate = new Date(user.createdAt);
      const localDate = userDate.toLocaleString();
      console.log(`Recent User ${index + 1}: ${user.name || 'No name'} - ${localDate}`);
    });
    
    // SIMPLIFIED: Get daily counts using date comparison
    const dailyStats = [];
    
    // Create array for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      
      // Count users for this specific day
      const dayUsers = recentUsers.filter(user => {
        const userDate = new Date(user.createdAt);
        return userDate >= date && userDate < nextDay;
      });
      
      dailyStats.push({
        date: date,
        dateString: date.toISOString().split('T')[0],
        count: dayUsers.length
      });
    }
    
    console.log("\n📅 DAILY STATS (SIMPLIFIED):");
    dailyStats.forEach(stat => {
      console.log(`${stat.dateString}: ${stat.count} users`);
    });
    
    // Get users before the week
    const usersBeforeWeek = await User.countDocuments({
      createdAt: { $lt: startOfWeek }
    });
    console.log(`\n👥 USERS BEFORE WEEK START: ${usersBeforeWeek}`);
    
    // Create data for last 7 days for frontend
    const dailyData = [];
    let cumulativeUsers = usersBeforeWeek;
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const dayStat = dailyStats.find(stat => {
        const statDate = new Date(stat.date);
        return statDate.getDate() === date.getDate() &&
               statDate.getMonth() === date.getMonth() &&
               statDate.getFullYear() === date.getFullYear();
      });
      
      const newUsers = dayStat ? dayStat.count : 0;
      cumulativeUsers += newUsers;
      
      dailyData.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        newUsers: newUsers,
        cumulativeUsers: cumulativeUsers,
        dateString: date.toISOString().split('T')[0],
        hasData: newUsers > 0
      });
    }
    
    console.log("\n🎯 FINAL DATA SENT TO FRONTEND:");
    dailyData.forEach(day => {
      console.log(`${day.date} (${day.fullDate}): ${day.newUsers} new, ${day.cumulativeUsers} cumulative`);
    });
    
    res.json({ 
      success: true, 
      data: dailyData,
      debug: {
        totalUsers: allUsers.length,
        usersBeforeWeek: usersBeforeWeek,
        recentUsersCount: recentUsers.length,
        queryRange: {
          start: startOfWeek.toISOString(),
          end: now.toISOString()
        }
      }
    });
    
  } catch (err) {
    console.error("❌ ERROR in weekly-stats:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch weekly statistics",
      error: err.message
    });
  }
});
export default router;