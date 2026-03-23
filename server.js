import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import historyRoutes from "./routes/history.js";
import faceRoutes from "./routes/face.js";
import uploadRoutes from "./routes/upload.js";

dotenv.config();
const app = express();

// ✅ Middleware
app.use(express.json());

// ✅ CORS CONFIG (frontend + local dev)
app.use(cors({
  origin: [
    "http://localhost:3000",              // React local
    "http://localhost:19006",            // Expo local
    "https://mediskinweb-frontend.onrender.com" // Deployed frontend
  ],
  credentials: true
}));

// ✅ Routes
app.use("/auth", authRoutes);
app.use("/api", chatRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/face", faceRoutes);
app.use("/api/upload", uploadRoutes);

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.json({ message: "🧴 Skincare Analyzer API is running!" });
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ✅ Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));