//Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 5001;

// Middleware
app.use(cors());
app.use(express.json()); // IMPORTANT: Allows parsing JSON bodies
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- CHAT ENDPOINT ---
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userContext } = req.body;

        // 1. Construct the Contextual Prompt
        // We feed the AI the user's live data so it acts like a real coach.
        const prompt = `
            You are FinZen, a friendly, encouraging, and proactive financial coach.
            
            USER CONTEXT:
            - Name: ${userContext.name}
            - Goal: ${userContext.goal}
            - Monthly Income: $${userContext.monthlyIncome}
            - Current Balance: $${userContext.balance.toFixed(2)}
            - Recent Transactions: ${JSON.stringify(userContext.transactions.slice(0, 5))}

            USER MESSAGE: "${message}"

            INSTRUCTIONS:
            - Keep your response short (under 50 words) and conversational.
            - Use the user's name occasionally.
            - Reference their specific data (like their balance or recent spending) if relevant.
            - Be supportive but realistic.
        `;

        // 2. Generate Content
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 3. Send back to frontend
        res.json({ reply: text });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ reply: "I'm having trouble connecting to my financial brain right now. Please try again!" });
    }
});

// Export the app for Vercel
module.exports = app;

// Only listen if running locally (not on Vercel)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}