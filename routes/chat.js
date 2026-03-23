import express from "express";
import dotenv from "dotenv";
import { CohereClient } from "cohere-ai";

dotenv.config();

const router = express.Router();

// Initialize Cohere client
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Log key status
if (!process.env.COHERE_API_KEY) {
  console.error("❌ COHERE_API_KEY missing from .env");
} else {
  console.log("✅ Cohere API Key loaded");
}

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // Updated models - using current available models
    const modelsToTry = [
      "command-a-03-2025",  // Latest Command model
      "command",           // General Command model
      "command-r-08-2024", // Command R from August 2024
      "command-r7b-12-2024" // Command R7B from December 2024
    ];
    
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await cohere.chat({
          model: model,
          message: message,
          preamble: `You are a helpful assistant. Provide direct, concise answers. 
          - Keep responses brief and to the point
          - Answer the question directly without unnecessary elaboration
          - For simple questions like math, just give the answer
          - Maximum 2-3 sentences for most responses
          - Only provide detailed explanations when explicitly asked`,
          temperature: 0.3,
          maxTokens: 150,
        });

        const reply = response.text;

        return res.json({ 
          response: reply,
          modelUsed: model
        });

      } catch (modelError) {
        console.log(`Model ${model} failed:`, modelError.body?.message || modelError.message);
        lastError = modelError;
        continue; // Try next model
      }
    }

    // If all models failed, try without specifying a model (uses default)
    try {
      console.log("Trying default model...");
      const response = await cohere.chat({
        message: message,
        preamble: `You are a helpful assistant. Provide direct, concise answers. 
        - Keep responses brief and to the point
        - Answer the question directly without unnecessary elaboration
        - For simple questions like math, just give the answer
        - Maximum 2-3 sentences for most responses
        - Only provide detailed explanations when explicitly asked`,
        temperature: 0.3,
        maxTokens: 150,
      });

      const reply = response.text;

      return res.json({ 
        response: reply,
        modelUsed: "default"
      });
    } catch (defaultError) {
      throw lastError || defaultError;
    }

  } catch (error) {
    console.error("❌ All Cohere models failed:", error);
    
    let errorMessage = "Sorry, the AI service is currently unavailable. Please try again later.";
    
    if (error.status === 401) {
      errorMessage = "API key is invalid. Please check your Cohere API key.";
    } else if (error.status === 429) {
      errorMessage = "Rate limit exceeded. Please try again in a moment.";
    } else if (error.body?.message?.includes('removed')) {
      errorMessage = "The AI models have been updated. Please check the Cohere documentation for available models.";
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

export default router;