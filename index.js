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
  { command: 'help', description: 'Learn about TICS AI and how to use it' },
  { command: 'about', description: 'About Qubetics project' },
  { command: 'test', description: 'Test if bot is working' }
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

_Powered by Gemini 2.0 Flash_ ⚡
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

bot.command('test', async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const chatType = ctx.chat.type;
  const testMessage = `
✅ *Bot Status: ONLINE*

🤖 **Bot Info:**
• Username: @${botInfo.username}
• ID: ${botInfo.id}
• Name: ${botInfo.first_name}
• Chat Type: ${chatType}

🔧 **Functionality:**
• Mention detection: Working
• Rate limiting: Active
• Gemini AI: Connected

💬 **How to use in ${chatType}:**
${chatType === 'private' 
  ? '• Just type your question directly\n• Example: "What is Qubetics?"' 
  : `• Mention me: @${botInfo.username} [question]\n• Example: "@${botInfo.username} What is Qubetics?"\n• Or reply to my messages`
}
  `.trim();
  
  await safeReply(ctx, testMessage, { parse_mode: 'Markdown' });
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
  
  console.log(`📨 Message from ${userName} in ${ctx.chat.type}: "${messageText}"`);
  console.log(`🔍 Bot username: @${botUsername}`);
  console.log(`👥 Group: ${isGroupChat}, Private: ${isPrivateChat}, Mentioned: ${mentioned}`);
  
  // Only respond in private chats or when mentioned in groups
  if (isPrivateChat || (isGroupChat && mentioned)) {
    console.log('✅ Processing message...');
    
    // Check rate limit
    if (isRateLimited(userId)) {
      console.log(`⏱️ Rate limited user: ${userId}`);
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
    
    console.log(`💭 Processing question: "${userQuestion}"`);
    
    try {
      // Show typing
      ctx.sendChatAction('typing').catch(() => {});
      
      const aiResponse = await callGeminiAPI(userQuestion);
      
      await safeReply(ctx, `🤖 *TICS AI:*\n\n${aiResponse}`, {
        parse_mode: 'Markdown',
        reply_to_message_id: message.message_id
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
        reply_to_message_id: message.message_id
      });
    }
  } else {
    console.log('❌ Not responding - group message without mention');
  }
});

// Handle bot being added to groups
bot.on('new_chat_members', async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const newMembers = ctx.message.new_chat_members;
  const botAdded = newMembers.some(member => member.id === botInfo.id);
  
  if (botAdded) {
    console.log(`🎉 Bot added to group: ${ctx.chat.title} (${ctx.chat.id})`);
    
    const welcomeMessage = `
🤖 *TICS AI joined the chat!*

Hello everyone! I'm TICS AI, your Qubetics assistant! 

🚀 **How to use me in groups:**
• Mention me: @${botInfo.username} [your question]
• Reply to my messages
• Ask about Qubetics, our ecosystem, and recent developments

💡 **Quick start:** @${botInfo.username} What makes Qubetics special?

_Ready to help with all your Qubetics questions!_ 💎
    `.trim();
    
    await safeReply(ctx, welcomeMessage, { parse_mode: 'Markdown' });
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
  console.log('💬 Tag the bot to interact in groups');
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
