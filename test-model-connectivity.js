// JavaScript test script for Node.js environment
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGeminiConnectivity() {
  try {
    console.log("Testing Gemini model connectivity...");
    
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY environment variable not set");
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const result = await model.generateContent("Hello, world!");
    const response = await result.response;
    const text = await response.text();
    
    console.log("Success! Received response:", text.substring(0, 50) + "...");
  } catch (error) {
    console.error("Error testing Gemini connectivity:", error.message);
    process.exit(1);
  }
}

// Run the test
testGeminiConnectivity();