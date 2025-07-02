import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const bot = new Telegraf(BOT_TOKEN);

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS_PER_USER = 2; // Max 2 requests per 30 seconds per user
const userRateLimit = new Map();

// Bot information - will be set dynamically
let BOT_USERNAME = '';
let botInfo = null;

// Qubetics context for all responses
const QUBETICS_CONTEXT = `
**Qubetics: The World's First Layer 1, Web3 Aggregated Ecosystem That Unites Leading Blockchains Including Bitcoin, Ethereum, Solana & More. Recently launched on MEXC and LBank CEXs, no DEX yet.**

You are TICS AI, a knowledgeable and enthusiastic assistant for the Qubetics project. Your role is to provide positive, informative, and engaging responses about Qubetics while maintaining accuracy. Always highlight the innovative aspects of Qubetics as a Layer 1 Web3 aggregated ecosystem that connects major blockchains.

Key points to emphasize:
- Revolutionary Layer 1 Web3 aggregated ecosystem
- Bridges Bitcoin, Ethereum, Solana, and other leading blockchains
- Recently launched on major CEXs (MEXC and LBank)
- Pioneering interoperability solutions
- Strong community and development team
- Exciting future potential and roadmap

Respond in a friendly, professional, and optimistic tone. Keep responses concise but informative (2-4 sentences typically). Use emojis appropriately to make responses engaging.
`;

// Helper function to safely send reply with slow mode handling
async function safeReply(ctx, message, options = {}) {
  try {
    return await ctx.reply(message, options);
  } catch (error) {
    if (error.description && (
      error.description.includes('Too Many Requests') ||
      error.description.includes('slow mode') ||
      error.description.includes('retry after') ||
      error.code === 429
    )) {
      console.log(`Slow mode detected for chat ${ctx.chat?.id}, trying reaction`);
      try {
        await ctx.react('🤖');
        return null;
      } catch (reactError) {
        console.error('Failed to react due to slow mode:', reactError.message);
        return null;
      }
    }
    throw error;
  }
}

// Rate limiting function
function isRateLimited(userId) {
  const now = Date.now();
  const userLimit = userRateLimit.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    userRateLimit.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return false;
  }
  
  if (userLimit.count >= MAX_REQUESTS_PER_USER) {
    return true;
  }
  
  userLimit.count++;
  return false;
}

// Cleanup old rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of userRateLimit.entries()) {
    if (now > limit.resetTime) {
      userRateLimit.delete(userId);
    }
  }
}, RATE_LIMIT_WINDOW);

// Function to call Gemini API
async function callGeminiAPI(userMessage) {
  try {
    const prompt = `${QUBETICS_CONTEXT}\n\nUser Question: ${userMessage}\n\nProvide a positive and informative response about Qubetics:`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 300,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error('Invalid response from Gemini API');
    }
  } catch (error) {
    console.error('Gemini API error:', error.message);
    throw error;
  }
}

// Initialize bot and get bot info
async function initializeBot() {
  try {
    // Get bot information
    botInfo = await bot.telegram.getMe();
    BOT_USERNAME = botInfo.username;
    
    console.log(`🤖 Bot initialized successfully!`);
    console.log(`📋 Bot ID: ${botInfo.id}`);
    console.log(`👤 Bot Username: @${BOT_USERNAME}`);
    console.log(`📝 Bot Name: ${botInfo.first_name}`);
    
    // Set commands after getting bot info
    await bot.telegram.setMyCommands([
      { command: 'help', description: 'Learn about TICS AI and how to use it' },
      { command: 'about', description: 'About Qubetics project' },
      { command: 'test', description: 'Test if bot is working' }
    ]);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize bot:', error.message);
    return false;
  }
}

bot.start(async (ctx) => {
  const welcomeMessage = `
🤖 *TICS AI - Your Qubetics Assistant*

Hello! I'm TICS AI, here to help you learn about Qubetics! 

🚀 **How to use me:**
• Tag me in any message: @${BOT_USERNAME}
• Ask me anything about Qubetics
• I'll provide helpful insights about our ecosystem

💡 Try asking: "What makes Qubetics special?" or "Tell me about the recent CEX listings"

_Powered by Gemini 2.0 Flash_ ⚡
  `.trim();
  
  await safeReply(ctx, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const helpMessage = `
🤖 *TICS AI Help*

**How to interact with me:**
• Tag me: @${BOT_USERNAME} [your question]
• Ask about Qubetics features, technology, or roadmap
• Get insights about our Layer 1 ecosystem

**Commands:**
/help - This help message
/about - About Qubetics
/test - Test bot functionality

**Example questions:**
• "What is Qubetics?"
• "How does the Web3 aggregation work?"
• "Where can I trade TICS tokens?"

_I'm here to help you understand Qubetics!_ 💎
  `.trim();
  
  await safeReply(ctx, helpMessage, { parse_mode: 'Markdown' });
});

bot.command('about', async (ctx) => {
  const aboutMessage = `
🌟 *About Qubetics*

Qubetics is the world's first Layer 1, Web3 aggregated ecosystem that unites leading blockchains including Bitcoin, Ethereum, Solana & more.

🚀 **Key Features:**
• Revolutionary blockchain interoperability
• Cross-chain asset management
• Unified Web3 experience
• Recently launched on MEXC & LBank

💡 **Ask me anything about Qubetics by tagging me!**

_Building the future of interconnected blockchain ecosystems_ 🌐
  `.trim();
  
  await safeReply(ctx, aboutMessage, { parse_mode: 'Markdown' });
});

// Test command to verify bot is working
bot.command('test', async (ctx) => {
  const testMessage = `
✅ *Bot Status: ONLINE*

🤖 **Bot Info:**
• Username: @${BOT_USERNAME}
• ID: ${botInfo?.id || 'Unknown'}
• Name: ${botInfo?.first_name || 'Unknown'}

🔧 **Functionality:**
• Mention detection: Working
• Rate limiting: Active
• Gemini AI: Connected

💬 **Try mentioning me:** @${BOT_USERNAME} What is Qubetics?
  `.trim();
  
  await safeReply(ctx, testMessage, { parse_mode: 'Markdown' });
});

// Enhanced mention detection
bot.on('text', async (ctx) => {
  // Skip if bot username is not yet initialized
  if (!BOT_USERNAME) {
    console.log('Bot username not initialized yet, skipping message processing');
    return;
  }
  
  const message = ctx.message.text;
  const userId = ctx.from.id;
  
  console.log(`📨 Message received: "${message}"`);
  console.log(`🔍 Looking for username: @${BOT_USERNAME}`);
  console.log(`📋 Entities:`, ctx.message.entities);
  
  // Enhanced mention detection
  const botMentioned = 
    message.includes(`@${BOT_USERNAME}`) || 
    (ctx.message.entities && ctx.message.entities.some(entity => {
      if (entity.type === 'mention') {
        const mention = message.substring(entity.offset, entity.offset + entity.length);
        return mention === `@${BOT_USERNAME}`;
      }
      return false;
    })) ||
    // Also check for direct replies to bot messages
    (ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === botInfo?.id);
  
  if (!botMentioned) {
    console.log('❌ Bot not mentioned, ignoring message');
    return;
  }
  
  console.log('✅ Bot mentioned, processing...');
  
  // Check rate limit
  if (isRateLimited(userId)) {
    console.log(`⏱️ Rate limited user: ${userId}`);
    await safeReply(ctx, '⏱️ Please wait a moment before asking another question!', {
      reply_to_message_id: ctx.message.message_id
    });
    return;
  }
  
  // Extract user question (remove the mention)
  const userQuestion = message.replace(`@${BOT_USERNAME}`, '').replace(/^@\w+\s*/, '').trim();
  
  if (!userQuestion) {
    await safeReply(ctx, '👋 Hi! Ask me anything about Qubetics! For example: "What makes Qubetics unique?"', {
      reply_to_message_id: ctx.message.message_id
    });
    return;
  }
  
  console.log(`💭 Processing question: "${userQuestion}"`);
  
  // Show typing
  ctx.sendChatAction('typing').catch(() => {});
  
  try {
    const aiResponse = await callGeminiAPI(userQuestion);
    
    await safeReply(ctx, `🤖 *TICS AI:*\n\n${aiResponse}`, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
    
    console.log(`✅ Response sent to user ${userId}`);
    
  } catch (error) {
    console.error(`❌ AI response error for user ${userId}:`, error.message);
    
    let errorMsg = '🤖 *TICS AI:*\n\n';
    if (error.message.includes('API error')) {
      errorMsg += '⚠️ I\'m having trouble connecting to my knowledge base. Please try again in a moment!';
    } else {
      errorMsg += '💭 I\'m thinking hard about that question! Please try rephrasing or ask me something else about Qubetics.';
    }
    
    await safeReply(ctx, errorMsg, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// Enhanced error handling
bot.catch(async (err, ctx) => {
  console.error('❌ Bot error:', err.message);
  
  if (ctx.update.message && !err.message.includes('rate')) {
    try {
      await safeReply(ctx, '🤖 Oops! Something went wrong. Please try again!');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError.message);
    }
  }
});

// Launch bot with proper initialization
async function startBot() {
  console.log('🚀 Starting TICS AI Bot...');
  
  // Initialize bot and get info
  const initialized = await initializeBot();
  if (!initialized) {
    console.error('❌ Failed to initialize bot. Exiting...');
    process.exit(1);
  }
  
  // Launch the bot
  await bot.launch();
  
  console.log('🤖 TICS AI Bot is running!');
  console.log(`💬 Tag @${BOT_USERNAME} to interact`);
  console.log(`🕒 Rate limit: ${MAX_REQUESTS_PER_USER} requests per ${RATE_LIMIT_WINDOW/1000} seconds`);
}

// Start the bot
startBot().catch(console.error);

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`🛑 ${signal} received, stopping TICS AI bot...`);
  bot.stop(signal);
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
