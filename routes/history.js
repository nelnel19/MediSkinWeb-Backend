import express from "express";
import History from "../models/History.js";
import crypto from "crypto";

const router = express.Router();

// Save analysis to history
router.post("/save-analysis", async (req, res) => {
  try {
    const { userEmail, imageUrl, analysisResult } = req.body;

    console.log("Save analysis request received:", { 
      userEmail, 
      hasImage: !!imageUrl, 
      hasResult: !!analysisResult 
    });

    if (!userEmail || !imageUrl || !analysisResult) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missing: {
          userEmail: !userEmail,
          imageUrl: !imageUrl,
          analysisResult: !analysisResult
        }
      });
    }

    // Generate hash from image URL
    const imageHash = crypto.createHash('md5')
      .update(imageUrl + Date.now())
      .digest('hex');

    // Extract skinGrade from analysisResult (handle both object and string formats)
    let skinGrade = 'Unknown';
    let overallCondition = 'Unknown';
    
    if (analysisResult.skin_grade) {
      skinGrade = analysisResult.skin_grade;
    } else if (analysisResult.skinGrade) {
      skinGrade = analysisResult.skinGrade;
    }
    
    // Determine overall condition based on skin grade if available
    if (skinGrade && typeof skinGrade === 'object' && skinGrade.grade) {
      const grade = skinGrade.grade;
      if (grade === 'A+' || grade === 'A') overallCondition = 'Excellent';
      else if (grade === 'B+' || grade === 'B') overallCondition = 'Good';
      else if (grade === 'C') overallCondition = 'Fair';
      else if (grade === 'D') overallCondition = 'Needs Improvement';
    } else if (typeof skinGrade === 'string') {
      if (skinGrade.startsWith('A')) overallCondition = 'Excellent';
      else if (skinGrade.startsWith('B')) overallCondition = 'Good';
      else if (skinGrade.startsWith('C')) overallCondition = 'Fair';
      else if (skinGrade.startsWith('D')) overallCondition = 'Needs Improvement';
    }

    // Check for existing analysis (within last hour to avoid duplicates)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingAnalysis = await History.findOne({ 
      userEmail, 
      imageHash: { $regex: imageHash.substring(0, 10) }, // Partial match
      timestamp: { $gte: oneHourAgo }
    });

    if (existingAnalysis) {
      return res.status(200).json({
        success: true,
        message: 'Analysis already saved recently',
        isDuplicate: true,
        id: existingAnalysis._id
      });
    }

    // Save to database
    const newAnalysis = new History({
      userEmail,
      imageHash,
      imageUrl,
      analysisData: analysisResult,
      skinGrade,
      overallCondition,
      timestamp: new Date()
    });

    await newAnalysis.save();

    console.log("Analysis saved successfully with ID:", newAnalysis._id);

    res.status(201).json({
      success: true,
      message: 'Analysis saved successfully',
      isDuplicate: false,
      id: newAnalysis._id
    });

  } catch (error) {
    console.error('Save analysis error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'Analysis already saved',
        isDuplicate: true
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
      error: error.toString()
    });
  }
});

// Get user's analysis history
router.get("/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const analyses = await History.find({ userEmail })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await History.countDocuments({ userEmail });

    res.json({
      success: true,
      data: analyses.map(analysis => ({
        id: analysis._id,
        imageUrl: analysis.imageUrl,
        skinGrade: analysis.skinGrade,
        overallCondition: analysis.overallCondition,
        timestamp: analysis.timestamp,
        analysisData: analysis.analysisData
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get specific analysis by ID
router.get("/analysis/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await History.findById(id);
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found'
      });
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Delete analysis from history
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await History.findByIdAndDelete(id);
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found'
      });
    }

    res.json({
      success: true,
      message: 'Analysis deleted from history successfully'
    });

  } catch (error) {
    console.error('Delete analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get analysis statistics for user
router.get("/stats/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;

    const totalAnalyses = await History.countDocuments({ userEmail });
    
    // Get latest analysis
    const latestAnalysis = await History.findOne({ userEmail })
      .sort({ timestamp: -1 });

    // Calculate average acne score
    const allAnalyses = await History.find({ userEmail }).select('analysisData');
    let totalAcneScore = 0;
    let validScores = 0;
    
    allAnalyses.forEach(analysis => {
      if (analysis.analysisData) {
        const acneScore = analysis.analysisData.acne || 
                         analysis.analysisData.skin_attributes?.acne;
        if (acneScore !== undefined && acneScore !== null) {
          totalAcneScore += acneScore;
          validScores++;
        }
      }
    });
    
    const averageAcneScore = validScores > 0 ? Math.round(totalAcneScore / validScores) : 0;

    // Get grade distribution
    const gradeDistribution = await History.aggregate([
      { $match: { userEmail } },
      { $group: { 
        _id: { 
          $ifNull: [
            "$skinGrade.grade",
            "$skinGrade",
            "Unknown"
          ]
        }, 
        count: { $sum: 1 } 
      } }
    ]);

    res.json({
      success: true,
      data: {
        totalAnalyses,
        gradeDistribution,
        latestAnalysis: latestAnalysis ? {
          age: latestAnalysis.analysisData?.age || 'N/A',
          gender: latestAnalysis.analysisData?.gender || 'N/A',
          acneScore: latestAnalysis.analysisData?.acne || 
                    latestAnalysis.analysisData?.skin_attributes?.acne || 0,
          skinGrade: latestAnalysis.skinGrade,
          imageUrl: latestAnalysis.imageUrl,
          timestamp: latestAnalysis.timestamp
        } : null,
        averageAcneScore
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get all histories (admin endpoint)
router.get("/all/histories", async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all histories with pagination
    const allHistories = await History.find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await History.countDocuments({});

    res.json({
      success: true,
      data: allHistories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all histories error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Test endpoint
router.post("/test", async (req, res) => {
  try {
    const testData = {
      userEmail: "test@example.com",
      imageUrl: "test-image-url",
      analysisResult: {
        age: "28",
        gender: "Female",
        acne: 45,
        skin_grade: {
          grade: "B+",
          description: "Good",
          color: "#CDDC39",
          overall_score: 41.3
        }
      }
    };

    // Generate hash
    const imageHash = crypto.createHash('md5')
      .update(testData.imageUrl + Date.now())
      .digest('hex');

    const newAnalysis = new History({
      userEmail: testData.userEmail,
      imageHash,
      imageUrl: testData.imageUrl,
      analysisData: testData.analysisResult,
      skinGrade: testData.analysisResult.skin_grade,
      overallCondition: "Good"
    });

    await newAnalysis.save();

    res.json({
      success: true,
      message: "Test data saved successfully",
      id: newAnalysis._id
    });

  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;