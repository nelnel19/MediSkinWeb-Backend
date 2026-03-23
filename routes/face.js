import express from 'express';
import multer from 'multer';
import axios from 'axios';
import crypto from 'crypto';
import sharp from 'sharp';

const router = express.Router();

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;

// Memory storage for multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cache to prevent duplicate processing
const analysisCache = new Map();

// FIXED: Correct crypto hash function for Node.js
function generateImageHash(imageData) {
  return crypto.createHash('md5').update(imageData).digest('hex');
}

async function validateImageQuality(imgBuffer) {
  try {
    const image = sharp(imgBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    // Check image resolution
    const minResolution = 640 * 480; // VGA quality
    const currentResolution = width * height;
    
    // Check aspect ratio (should be roughly square for face detection)
    const aspectRatio = width / height;
    const aspectOk = 0.7 <= aspectRatio && aspectRatio <= 1.3;
    
    const qualityIssues = [];
    
    if (currentResolution < minResolution) {
      qualityIssues.push("Low resolution");
    }
    
    if (!aspectOk) {
      qualityIssues.push("Poor aspect ratio");
    }
    
    return {
      is_acceptable: qualityIssues.length === 0,
      resolution: `${width}x${height}`,
      issues: qualityIssues,
      recommendations: [
        "Use good lighting (natural light preferred)",
        "Ensure face is clearly visible and centered",
        "Avoid shadows and glare",
        "Use front camera with high resolution",
        "Keep neutral expression"
      ]
    };
  } catch (error) {
    return {
      is_acceptable: true, // Default to True if check fails
      error: error.message
    };
  }
}

function analyzeSkinAttributes(skinData, gender, age) {
  // Extract raw scores with safe defaults
  const acneScore = skinData.acne || 0;
  const darkCircleScore = skinData.dark_circle || 0;
  const blackheadScore = skinData.blackhead || 0;
  const healthScore = skinData.health || 0;
  const stainScore = skinData.stain || 0;
  const clarityScore = skinData.clarity || 0;

  console.log('Raw Face++ Scores:', {
    acne: acneScore,
    dark_circle: darkCircleScore,
    blackhead: blackheadScore,
    health: healthScore,
    stain: stainScore,
    clarity: clarityScore
  });

  // Age and gender adjustments (more conservative)
  const ageFactor = Math.min(age / 80, 1.0) || 0.5;
  const isMale = gender.toLowerCase() === "male";

  // IMPROVED ACNE DETECTION - Much more conservative
  const acneAdjustment = (1.0 - ageFactor) * 0.2; // Less weight for age
  const finalAcneAdjustment = isMale ? acneAdjustment + 0.1 : acneAdjustment;
  
  // Combined acne index with higher thresholds
  let acneIndex = (acneScore * 0.6) + ((1 - healthScore) * 0.2) + finalAcneAdjustment;
  acneIndex = Math.min(Math.max(acneIndex, 0), 1);

  console.log('Acne Index:', acneIndex);

  // Higher thresholds for acne detection
  let acne;
  if (acneIndex < 0.3) { // Lowered threshold
    acne = "None";
  } else if (acneIndex < 0.5) {
    acne = "Very Mild";
  } else if (acneIndex < 0.65) {
    acne = "Mild";
  } else if (acneIndex < 0.8) {
    acne = "Moderate";
  } else {
    acne = "Severe";
  }

  // REMOVED PIMPLE DETECTION - It's not working properly

  // IMPROVED DARK CIRCLES - More conservative
  const darkCircleAdjustment = ageFactor * 0.15; // Reduced adjustment
  let darkCircleIndex = (darkCircleScore * 0.8) + darkCircleAdjustment;
  darkCircleIndex = Math.min(Math.max(darkCircleIndex, 0), 1);

  let darkCircles;
  if (darkCircleIndex < 0.3) {
    darkCircles = "None";
  } else if (darkCircleIndex < 0.55) {
    darkCircles = "Mild";
  } else if (darkCircleIndex < 0.75) {
    darkCircles = "Moderate";
  } else {
    darkCircles = "Heavy";
  }

  // IMPROVED BLACKHEADS - More conservative
  let blackheadIndex = (blackheadScore * 0.7) + ((1 - clarityScore) * 0.3);
  blackheadIndex = Math.min(Math.max(blackheadIndex, 0), 1);

  let blackheads;
  if (blackheadIndex < 0.25) {
    blackheads = "None";
  } else if (blackheadIndex < 0.5) {
    blackheads = "Few";
  } else if (blackheadIndex < 0.7) {
    blackheads = "Moderate";
  } else {
    blackheads = "Many";
  }

  // IMPROVED SKIN TONE - More accurate assessment
  let skinTone;
  if (healthScore > 0.75 && clarityScore > 0.7) {
    skinTone = "Radiant";
  } else if (healthScore > 0.6 && stainScore < 0.3) {
    skinTone = "Healthy";
  } else if (stainScore > 0.5 || clarityScore < 0.4) {
    skinTone = "Uneven";
  } else if (healthScore < 0.4) {
    skinTone = "Dull";
  } else {
    skinTone = "Normal";
  }

  // IMPROVED OVERALL CONDITION - More balanced
  const combinedScore = (healthScore * 0.4 + clarityScore * 0.3 + 
                       (1 - acneScore) * 0.2 + (1 - stainScore) * 0.1);
  
  let overallCondition, skinGrade;
  if (combinedScore > 0.8) {
    overallCondition = "Excellent";
    skinGrade = "A";
  } else if (combinedScore > 0.65) {
    overallCondition = "Good";
    skinGrade = "B";
  } else if (combinedScore > 0.5) {
    overallCondition = "Fair";
    skinGrade = "C";
  } else {
    overallCondition = "Needs Care";
    skinGrade = "D";
  }

  // Additional metrics with better accuracy
  const skinMoisture = healthScore > 0.75 ? "High" : healthScore > 0.5 ? "Medium" : "Low";
  const poreVisibility = clarityScore > 0.75 ? "Minimal" : clarityScore > 0.45 ? "Visible" : "Prominent";

  // Confidence score based on multiple factors
  const confidenceFactors = [
    healthScore,
    clarityScore,
    1 - Math.min(acneScore * 2, 1), // Penalize high acne scores (likely false positives)
    1 - Math.min(stainScore * 1.5, 1) // Penalize high stain scores
  ];
  const analysisConfidence = (confidenceFactors.reduce((a, b) => a + b, 0) / confidenceFactors.length) * 100;

  const result = {
    acne,
    dark_circles: darkCircles,
    blackheads,
    skin_tone: skinTone,
    overall_condition: overallCondition,
    skin_grade: skinGrade,
    skin_moisture: skinMoisture,
    pore_visibility: poreVisibility,
    analysis_confidence: Math.round(analysisConfidence * 10) / 10,
    raw_scores: {
      acne_score: Math.round(acneScore * 1000) / 1000,
      health_score: Math.round(healthScore * 1000) / 1000,
      clarity_score: Math.round(clarityScore * 1000) / 1000,
      dark_circle_score: Math.round(darkCircleScore * 1000) / 1000,
      blackhead_score: Math.round(blackheadScore * 1000) / 1000,
      stain_score: Math.round(stainScore * 1000) / 1000,
      combined_score: Math.round(combinedScore * 1000) / 1000
    }
  };

  console.log('Final Analysis Result:', result);
  return result;
}

// Root endpoint
router.get('/', (req, res) => {
  res.json({ message: "🧴 Enhanced Skincare Analyzer Backend is running!" });
});

// Skin analysis endpoint
router.post('/analyze/skin', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imgBuffer = req.file.buffer;
    
    // Validate image quality first
    const qualityCheck = await validateImageQuality(imgBuffer);
    if (!qualityCheck.is_acceptable) {
      return res.status(400).json({
        error: "Poor image quality detected",
        issues: qualityCheck.issues,
        recommendations: qualityCheck.recommendations,
        analysis_skipped: true
      });
    }
    
    // Generate unique hash for this image
    const imageHash = generateImageHash(imgBuffer);
    
    // Check cache
    if (analysisCache.has(imageHash)) {
      console.log("Returning cached result for same image");
      return res.json(analysisCache.get(imageHash));
    }
    
    console.log(`Analyzing new image with hash: ${imageHash.substring(0, 16)}...`);
    console.log(`Image quality:`, qualityCheck);

    const analyses = [];
    
    // Try analysis multiple times with different parameters
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Create form data for Face++ API
        const formData = new FormData();
        formData.append('api_key', FACEPP_API_KEY);
        formData.append('api_secret', FACEPP_API_SECRET);
        formData.append('return_attributes', 'skinstatus,gender,age');
        
        // Convert buffer to blob for FormData
        const blob = new Blob([imgBuffer], { type: req.file.mimetype });
        formData.append('image_file', blob, req.file.originalname);

        const response = await axios.post('https://api-us.faceplusplus.com/facepp/v3/detect', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000
        });

        const result = response.data;

        if (!result.faces || result.faces.length === 0) {
          if (attempt === 1) {
            return res.status(400).json({ 
              error: "No face detected in image. Please ensure face is clearly visible." 
            });
          }
          continue;
        }

        const faceData = result.faces[0];
        const attrs = faceData.attributes || {};
        const skinData = attrs.skinstatus || {};
        const genderData = attrs.gender?.value || "Unknown";
        const ageData = attrs.age?.value || 25;

        console.log(`Attempt ${attempt + 1} - Gender: ${genderData}, Age: ${ageData}`);
        console.log(`Raw skin scores:`, skinData);

        // Enhanced analysis with age and gender considerations
        const analysisResult = analyzeSkinAttributes(skinData, genderData, ageData);
        
        // Add basic info
        Object.assign(analysisResult, {
          gender: genderData,
          estimated_age: ageData,
          face_confidence: Math.round((faceData.face_rectangle?.confidence || 0) * 1000) / 10,
          timestamp: Date.now(),
          image_hash: imageHash.substring(0, 16),
          analysis_attempt: attempt + 1
        });

        analyses.push(analysisResult);
        
      } catch (error) {
        console.log(`Analysis attempt ${attempt + 1} failed:`, error.message);
        
        if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
          if (attempt === 1) {
            return res.status(408).json({ error: "Analysis timeout. Please try again." });
          }
          continue;
        }
        
        if (attempt === 1 && analyses.length === 0) {
          throw error;
        }
      }
    }

    if (analyses.length === 0) {
      return res.status(500).json({ error: "All analysis attempts failed" });
    }

    // Use the best analysis (highest confidence)
    const finalResult = analyses.reduce((best, current) => 
      (current.analysis_confidence > (best.analysis_confidence || 0)) ? current : best
    );
    
    finalResult.analysis_attempts = analyses.length;
    finalResult.image_quality = qualityCheck;
    
    // Cache result
    analysisCache.set(imageHash, finalResult);
    
    // Limit cache size
    if (analysisCache.size > 50) {
      const firstKey = analysisCache.keys().next().value;
      analysisCache.delete(firstKey);
    }

    console.log(`Final analysis result: ${finalResult.skin_grade} - ${finalResult.overall_condition}`);
    res.json(finalResult);

  } catch (error) {
    console.error('Error analyzing image:', error);
    
    if (error.response?.status === 503) {
      return res.status(503).json({ error: "Service temporarily unavailable" });
    }
    
    if (error.response?.data?.error) {
      return res.status(error.response.status).json({ error: error.response.data.error });
    }
    
    res.status(500).json({ 
      error: `Error analyzing image: ${error.message}` 
    });
  }
});

// Clear cache endpoint
router.get('/clear-cache', (req, res) => {
  analysisCache.clear();
  res.json({ message: "Cache cleared" });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    timestamp: Date.now(),
    cache_size: analysisCache.size
  });
});

export default router;