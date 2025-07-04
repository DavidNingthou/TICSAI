import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const bot = new Telegraf(BOT_TOKEN);

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS_PER_USER = 2; // Max 2 requests per 30 seconds per user
const userRateLimit = new Map();

// Qubetics context for all responses
const QUBETICS_CONTEXT = `
**Qubetics: The World's First Layer 1, Web3 Aggregated Ecosystem That Unites Leading Blockchains Including Bitcoin, Ethereum, Solana & More. Recently launched on MEXC and LBank CEXs, no DEX yet.**

You are TICS AI, an AI assistant for the Qubetics project. Your role is to provide answers while maintaining accuracy.
- Raised over 18m USD on presale with about 517,152,289 $Tics sold. total supply is 1,361,867,964.
- Supports wallet that allows adding custom network like metamask. Network Details: Name: Qubetics, rpc: https://rpc.qubetics.com, chain ID: 9030, explorer: https://ticsscan.com.  
- Recently launched on major CEXs (MEXC and LBank)  on 30th june, coin gecko req sumitted. cmc will be updated soon. Initial release for Qubetics wallet available on playstore, ios pending review.
- Pre sale tokens will be automatically airdropped to their allocated wallet post 1 month listing, starts from 30th july they get 10% after that 1% daily for 90 days. co claim or fee needed.

Respond in a friendly tone. Keep responses short, just address the query and don't add anything else..
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
    const prompt = `${QUBETICS_CONTEXT}\n\nUser Question: ${userMessage}`;
    
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

// Function to check if bot is mentioned (using the working approach)
async function isBotMentioned(ctx) {
  try {
    // Get bot info fresh each time (like the working bot)
    const botInfo = await bot.telegram.getMe();
    const botUsername = botInfo.username;
    const message = ctx.message;
    
    if (!message.entities) return false;
    
    const mentions = message.entities.filter(entity => 
      entity.type === 'mention' || entity.type === 'text_mention'
    );
    
    for (const mention of mentions) {
      if (mention.type === 'mention') {
        const mentionedUsername = message.text.substring(
          mention.offset + 1, 
          mention.offset + mention.length
        );
        if (mentionedUsername.toLowerCase() === botUsername.toLowerCase()) {
          return true;
        }
      } else if (mention.type === 'text_mention' && mention.user) {
        if (mention.user.username && mention.user.username.toLowerCase() === botUsername.toLowerCase()) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking bot mention:', error);
    return false;
  }
}

// Commands setup
bot.telegram.setMyCommands([
  { command: 'about', description: 'About Qubetics project' }
]);

bot.start(async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const welcomeMessage = `
🤖 *TICS AI - Your Qubetics Assistant*

Hello! I'm TICS AI, here to help you learn about Qubetics! 

🚀 **How to use me:**
• Tag me in any message: @${botInfo.username}
• Ask me anything about Qubetics
• I'll provide helpful insights about our ecosystem

💡 Try asking: "What makes Qubetics special?" or "Tell me about the recent CEX listings"
  `.trim();
  
  await safeReply(ctx, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const helpMessage = `
🤖 *TICS AI Help*

**How to interact with me:**
• Tag me: @${botInfo.username} [your question]
• Ask about Qubetics features, technology, or roadmap
• Get insights about our Layer 1 ecosystem

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

// Handle ALL messages (using the working approach)
bot.on('message', async (ctx) => {
  const message = ctx.message;
  const chatId = ctx.chat.id;
  const messageText = message.text;
  const userName = ctx.from.first_name || ctx.from.username || 'Anon User';
  const userId = ctx.from.id;
  
  // Skip if no text
  if (!messageText) return;
  
  // Get bot info
  const botInfo = await bot.telegram.getMe();
  const botUsername = botInfo.username;
  
  // Determine chat type and mention status
  const isGroupChat = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  const isPrivateChat = ctx.chat.type === 'private';
  const mentioned = await isBotMentioned(ctx);
  
  console.log(`📨 Message from ${userName}: "${messageText}"`);
  
  // Only respond in private chats or when mentioned in groups
  if (isPrivateChat || (isGroupChat && mentioned)) {
    
    // Check rate limit
    if (isRateLimited(userId)) {
      await safeReply(ctx, '⏱️ Please wait a moment before asking another question!', {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    // Extract user question (remove mention if in group)
    let userQuestion = messageText;
    if (isGroupChat) {
      userQuestion = messageText.replace(`@${botUsername}`, '').replace(/^@\w+\s*/, '').trim();
    }
    
    if (!userQuestion) {
      const helpText = isPrivateChat 
        ? '👋 Hi! Ask me anything about Qubetics! For example: "What makes Qubetics unique?"'
        : `👋 Hi! Ask me anything about Qubetics! For example: "@${botUsername} What makes Qubetics unique?"`;
      
      await safeReply(ctx, helpText, {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    try {
      // Show typing
      ctx.sendChatAction('typing').catch(() => {});
      
      const aiResponse = await callGeminiAPI(userQuestion);
      
      await safeReply(ctx, `${aiResponse}`, {
        parse_mode: 'Markdown',
        reply_to_message_id: message.message_id
      });
      
    } catch (error) {
      console.error(`❌ AI response error for user ${userId}:`, error.message);
      
      let errorMsg = '';
      if (error.message.includes('API error')) {
        errorMsg += '⚠️ I\'m having trouble connecting to my knowledge base. Please try again in a moment!';
      } else {
        errorMsg += '💭 I\'m thinking hard about that question! Please try rephrasing or ask me something else about Qubetics.';
      }
      
      await safeReply(ctx, errorMsg, {
        parse_mode: 'Markdown',
        reply_to_message_id: message.message_id
      });
    }
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

// Launch bot
bot.launch().then(() => {
  console.log('🤖 TICS AI Bot is running!');
  console.log(`🕒 Rate limit: ${MAX_REQUESTS_PER_USER} requests per ${RATE_LIMIT_WINDOW/1000} seconds`);
}).catch(console.error);

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`🛑 ${signal} received, stopping TICS AI bot...`);
  bot.stop(signal);
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
