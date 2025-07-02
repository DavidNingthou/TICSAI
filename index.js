// Replace your existing mention detection section with this:

// Handle mentions/tags - SIMPLIFIED VERSION
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  const userId = ctx.from.id;
  
  // Skip commands
  if (message.startsWith('/')) return;
  
  // Multiple ways to detect mentions
  const botMentioned = 
    message.toLowerCase().includes('@ticsaibot') ||
    message.toLowerCase().includes('ticsaibot') ||
    message.toLowerCase().includes('@tics ai') ||
    message.toLowerCase().includes('tics ai') ||
    (ctx.message.entities && ctx.message.entities.some(entity => 
      entity.type === 'mention' || entity.type === 'text_mention'
    ));
  
  if (!botMentioned) return;
  
  // Check rate limit
  if (isRateLimited(userId)) {
    await safeReply(ctx, '⏱️ Please wait a moment before asking another question!', {
      reply_to_message_id: ctx.message.message_id
    });
    return;
  }
  
  // Extract question - remove all possible bot mentions
  let userQuestion = message
    .replace(/@ticsaibot/gi, '')
    .replace(/ticsaibot/gi, '')
    .replace(/@tics ai/gi, '')
    .replace(/tics ai/gi, '')
    .trim();
  
  if (!userQuestion) {
    await safeReply(ctx, '👋 Hi! Ask me anything about Qubetics! For example: "What makes Qubetics unique?"', {
      reply_to_message_id: ctx.message.message_id
    });
    return;
  }
  
  // Show typing
  ctx.sendChatAction('typing').catch(() => {});
  
  try {
    const aiResponse = await callGeminiAPI(userQuestion);
    
    await safeReply(ctx, `🤖 *TICS AI:*\n\n${aiResponse}`, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
    
  } catch (error) {
    console.error(`AI response error for user ${userId}:`, error.message);
    
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
