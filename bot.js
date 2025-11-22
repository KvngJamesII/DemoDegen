const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Replace with your bot token
const BOT_TOKEN = '8381695748:AAH0FVocxYasRw67FP76Hl7Dnu1TbIKyJss';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// DexScreener API base URL
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// User data storage (in production, use a database)
const users = new Map();
const positions = new Map();

// Initialize user balances
function initUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      balances: {
        SOL: 1000,
        ETH: 1000,
        BNB: 1000,
        BASE: 1000
      },
      positions: []
    });
    positions.set(userId, []);
  }
  return users.get(userId);
}

// Format number with commas
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}

// Format price
function formatPrice(price) {
  if (price < 0.000001) {
    return price.toExponential(2);
  } else if (price < 0.01) {
    return price.toFixed(8);
  }
  return price.toFixed(6);
}

// Fetch token data from DexScreener
async function fetchTokenData(tokenCA) {
  try {
    const response = await axios.get(`${DEXSCREENER_API}/tokens/${tokenCA}`, {
      timeout: 10000
    });
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      // Get the pair with highest liquidity
      const pair = response.data.pairs.sort((a, b) => 
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
      
      return {
        success: true,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        price: parseFloat(pair.priceUsd || 0),
        priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
        marketCap: pair.fdv || pair.marketCap || 0,
        liquidity: pair.liquidity?.usd || 0,
        volume24h: pair.volume?.h24 || 0,
        chain: pair.chainId.toUpperCase(),
        dexId: pair.dexId,
        pairAddress: pair.pairAddress,
        url: pair.url
      };
    }
    
    return { success: false, error: 'Token not found on any DEX' };
  } catch (error) {
    console.error('Error fetching token data:', error.message);
    return { success: false, error: 'Failed to fetch token data' };
  }
}

// Welcome message
const welcomeMessage = `🎰 *Welcome to Demo Degen Bot!* 🚀

This is a demo trading bot where you can practice degen trading strategies with virtual funds!

💰 *Starting Balances:*
• SOL: $1,000
• ETH: $1,000
• BNB: $1,000
• BASE: $1,000

📖 *How to Use:*
1️⃣ Send any token Contract Address (CA)
2️⃣ View REAL token details from DexScreener
3️⃣ Open positions and track them
4️⃣ Compete on the leaderboard!

⚠️ *Remember:* This is DEMO only - no real money involved!

Click the button below to access the main menu 👇`;

// Main menu message
function getMenuMessage(userId) {
  const user = initUser(userId);
  const solBalance = user.balances.SOL;
  const openPositions = user.positions.length;
  
  return `📊 *MAIN MENU* 📊

💎 SOL Balance: *$${formatNumber(solBalance)}*
📈 Open Positions: *${openPositions > 0 ? `(${openPositions})` : 'None'}*

Select an option below:`;
}

// Main menu keyboard
const mainMenuKeyboard = {
  inline_keyboard: [
    [
      { text: '📊 POSITIONS', callback_data: 'menu_positions' },
      { text: '🔍 ANALYSIS', callback_data: 'menu_analysis' }
    ],
    [
      { text: '🏆 LEADERBOARD', callback_data: 'menu_leaderboard' },
      { text: '💰 BALANCE', callback_data: 'menu_balance' }
    ],
    [
      { text: '⚙️ SETTINGS', callback_data: 'menu_settings' },
      { text: 'ℹ️ HELP', callback_data: 'menu_help' }
    ]
  ]
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  initUser(userId);
  
  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🎮 OPEN MENU', callback_data: 'open_menu' }]]
    }
  });
});

// Handle callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data;
  
  await bot.answerCallbackQuery(query.id);
  
  if (data === 'open_menu') {
    bot.editMessageText(getMenuMessage(userId), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard
    });
  }
  
  else if (data === 'menu_positions') {
    const user = initUser(userId);
    let posText = '📊 *YOUR POSITIONS* 📊\n\n';
    
    if (user.positions.length === 0) {
      posText += '❌ No open positions\n\nSend a token CA to start trading!';
    } else {
      for (let idx = 0; idx < user.positions.length; idx++) {
        const pos = user.positions[idx];
        
        // Fetch current price
        const tokenData = await fetchTokenData(pos.tokenCA);
        if (tokenData.success) {
          pos.currentPrice = tokenData.price;
          pos.currentValue = (pos.amount / pos.entryPrice) * pos.currentPrice;
        }
        
        const pnl = pos.currentValue - pos.invested;
        const pnlPercent = ((pnl / pos.invested) * 100).toFixed(2);
        const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
        
        posText += `*Position ${idx + 1}*\n`;
        posText += `Token: ${pos.tokenName} (${pos.tokenSymbol})\n`;
        posText += `Chain: ${pos.chain}\n`;
        posText += `Entry: $${formatPrice(pos.entryPrice)}\n`;
        posText += `Current: $${formatPrice(pos.currentPrice)}\n`;
        posText += `Invested: $${formatNumber(pos.invested)}\n`;
        posText += `Value: $${formatNumber(pos.currentValue)}\n`;
        posText += `${pnlEmoji} P&L: $${formatNumber(pnl)} (${pnlPercent}%)\n\n`;
      }
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 REFRESH', callback_data: 'refresh_positions' }],
        [{ text: '🏠 MENU', callback_data: 'open_menu' }]
      ]
    };
    
    bot.editMessageText(posText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
  
  else if (data === 'refresh_positions') {
    const user = initUser(userId);
    let posText = '📊 *YOUR POSITIONS* 📊\n\n🔄 Refreshing...\n\n';
    
    if (user.positions.length === 0) {
      posText = '📊 *YOUR POSITIONS* 📊\n\n❌ No open positions';
    } else {
      for (let idx = 0; idx < user.positions.length; idx++) {
        const pos = user.positions[idx];
        
        // Fetch current price
        const tokenData = await fetchTokenData(pos.tokenCA);
        if (tokenData.success) {
          pos.currentPrice = tokenData.price;
          pos.currentValue = (pos.amount / pos.entryPrice) * pos.currentPrice;
        }
        
        const pnl = pos.currentValue - pos.invested;
        const pnlPercent = ((pnl / pos.invested) * 100).toFixed(2);
        const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
        
        if (idx === 0) posText = '📊 *YOUR POSITIONS* 📊\n\n';
        
        posText += `*Position ${idx + 1}*\n`;
        posText += `Token: ${pos.tokenName} (${pos.tokenSymbol})\n`;
        posText += `Chain: ${pos.chain}\n`;
        posText += `Entry: $${formatPrice(pos.entryPrice)}\n`;
        posText += `Current: $${formatPrice(pos.currentPrice)}\n`;
        posText += `Invested: $${formatNumber(pos.invested)}\n`;
        posText += `Value: $${formatNumber(pos.currentValue)}\n`;
        posText += `${pnlEmoji} P&L: $${formatNumber(pnl)} (${pnlPercent}%)\n\n`;
      }
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 REFRESH', callback_data: 'refresh_positions' }],
        [{ text: '🏠 MENU', callback_data: 'open_menu' }]
      ]
    };
    
    bot.editMessageText(posText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
  
  else if (data === 'menu_balance') {
    const user = initUser(userId);
    let balText = '💰 *YOUR BALANCES* 💰\n\n';
    
    for (const [chain, amount] of Object.entries(user.balances)) {
      balText += `${chain}: *$${formatNumber(amount)}*\n`;
    }
    
    const totalPositions = user.positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalBalance = Object.values(user.balances).reduce((sum, val) => sum + val, 0);
    
    balText += `\n📊 In Positions: *$${formatNumber(totalPositions)}*`;
    balText += `\n💎 Total Portfolio: *$${formatNumber(totalBalance + totalPositions)}*`;
    
    bot.editMessageText(balText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
  }
  
  else if (data === 'menu_analysis') {
    const analysisText = `🔍 *MARKET ANALYSIS* 🔍

📈 Send a token CA to get:
• Real-time price data
• 24h volume & liquidity
• Price change statistics
• Market cap information
• DEX trading pairs

Powered by DexScreener API 🚀`;
    
    bot.editMessageText(analysisText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
  }
  
  else if (data === 'menu_leaderboard') {
    let leaderText = '🏆 *LEADERBOARD* 🏆\n\n';
    leaderText += '🥇 DegenKing: $15,420\n';
    leaderText += '🥈 MoonBoi: $12,850\n';
    leaderText += '🥉 DiamondHands: $9,600\n';
    leaderText += '4️⃣ PaperHands: $7,200\n';
    leaderText += '5️⃣ You: $4,000\n\n';
    leaderText += '💪 Keep trading to climb the ranks!';
    
    bot.editMessageText(leaderText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
  }
  
  else if (data === 'menu_settings') {
    const settingsText = `⚙️ *SETTINGS* ⚙️

🔔 Notifications: ON
🌐 Default Chain: SOL
⚡ Slippage: 1%
⏱️ Auto-Refresh: 30s

Settings coming soon!`;
    
    bot.editMessageText(settingsText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
  }
  
  else if (data === 'menu_help') {
    bot.editMessageText(welcomeMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
  }
  
  else if (data.startsWith('buy_')) {
    const parts = data.split('_');
    const amount = parts[1];
    const tokenCA = parts.slice(2).join('_');
    
    if (amount === 'custom') {
      bot.sendMessage(chatId, '💵 Enter custom amount (e.g., 50):', {
        reply_markup: {
          force_reply: true
        }
      });
      // Store token CA for later
      users.get(userId).pendingToken = tokenCA;
      users.get(userId).pendingMessageId = messageId;
    } else {
      await executeBuy(chatId, userId, messageId, tokenCA, parseFloat(amount));
    }
  }
  
  else if (data.startsWith('refresh_token_')) {
    const tokenCA = data.replace('refresh_token_', '');
    bot.editMessageText('🔄 Refreshing token data...', {
      chat_id: chatId,
      message_id: messageId
    });
    
    setTimeout(async () => {
      await showTokenDetails(chatId, messageId, tokenCA);
    }, 500);
  }
});

// Handle text messages (CA detection)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  // Skip commands
  if (!text || text.startsWith('/')) return;
  
  // Check if user is entering custom amount
  const user = users.get(userId);
  if (user && user.pendingToken && msg.reply_to_message) {
    const amount = parseFloat(text);
    if (!isNaN(amount) && amount > 0) {
      await executeBuy(chatId, userId, user.pendingMessageId, user.pendingToken, amount);
      delete user.pendingToken;
      delete user.pendingMessageId;
      return;
    }
  }
  
  // Check if it looks like a CA (alphanumeric, 32-44 chars)
  const caPattern = /^[A-Za-z0-9]{32,44}$/;
  if (caPattern.test(text.trim())) {
    const tokenCA = text.trim();
    const sentMsg = await bot.sendMessage(chatId, '🔍 Fetching real token data from DexScreener...');
    
    setTimeout(async () => {
      await showTokenDetails(chatId, sentMsg.message_id, tokenCA);
    }, 1000);
  }
});

// Show token details
async function showTokenDetails(chatId, messageId, tokenCA) {
  const tokenData = await fetchTokenData(tokenCA);
  
  if (!tokenData.success) {
    bot.editMessageText(`❌ *ERROR* ❌\n\n${tokenData.error}\n\nPlease check the contract address and try again.`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 MENU', callback_data: 'open_menu' }]]
      }
    });
    return;
  }
  
  const priceChangeEmoji = tokenData.priceChange24h >= 0 ? '🟢' : '🔴';
  const priceChangeText = tokenData.priceChange24h >= 0 ? '+' : '';
  
  const detailsText = `🪙 *TOKEN DETAILS* 🪙

📛 Name: *${tokenData.name}*
💎 Symbol: *${tokenData.symbol}*
📝 CA: \`${tokenCA}\`

⛓️ Chain: *${tokenData.chain}*
🏪 DEX: *${tokenData.dexId}*

💵 Price: *$${formatPrice(tokenData.price)}*
${priceChangeEmoji} 24h Change: *${priceChangeText}${tokenData.priceChange24h.toFixed(2)}%*

📊 Market Cap: *$${formatNumber(tokenData.marketCap)}*
💧 Liquidity: *$${formatNumber(tokenData.liquidity)}*
📈 Volume 24h: *$${formatNumber(tokenData.volume24h)}*

🔗 [View on DexScreener](${tokenData.url})`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '💵 $10', callback_data: `buy_10_${tokenCA}` },
        { text: '💵 $25', callback_data: `buy_25_${tokenCA}` },
        { text: '💵 $50', callback_data: `buy_50_${tokenCA}` }
      ],
      [
        { text: '💵 $100', callback_data: `buy_100_${tokenCA}` },
        { text: '💵 $250', callback_data: `buy_250_${tokenCA}` },
        { text: '💵 $500', callback_data: `buy_500_${tokenCA}` }
      ],
      [{ text: '✏️ CUSTOM AMOUNT', callback_data: `buy_custom_${tokenCA}` }],
      [
        { text: '🔄 REFRESH', callback_data: `refresh_token_${tokenCA}` },
        { text: '🏠 MENU', callback_data: 'open_menu' }
      ]
    ]
  };
  
  bot.editMessageText(detailsText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true
  });
}

// Execute buy
async function executeBuy(chatId, userId, messageId, tokenCA, amount) {
  const user = initUser(userId);
  
  if (user.balances.SOL < amount) {
    bot.sendMessage(chatId, '❌ Insufficient SOL balance!');
    return;
  }
  
  // Fetch current token data
  const tokenData = await fetchTokenData(tokenCA);
  
  if (!tokenData.success) {
    bot.sendMessage(chatId, '❌ Failed to fetch token data. Please try again.');
    return;
  }
  
  user.balances.SOL -= amount;
  
  const position = {
    tokenCA: tokenCA,
    tokenName: tokenData.name,
    tokenSymbol: tokenData.symbol,
    chain: tokenData.chain,
    invested: amount,
    entryPrice: tokenData.price,
    currentPrice: tokenData.price,
    currentValue: amount,
    amount: amount,
    timestamp: Date.now()
  };
  
  user.positions.push(position);
  
  const confirmText = `✅ *POSITION OPENED!* ✅

🪙 Token: ${tokenData.name} (${tokenData.symbol})
💰 Invested: $${formatNumber(amount)}
💵 Entry Price: $${formatPrice(tokenData.price)}
⛓️ Chain: ${tokenData.chain}

📊 Track your position in the POSITIONS menu!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📊 VIEW POSITIONS', callback_data: 'menu_positions' }],
      [{ text: '🏠 MENU', callback_data: 'open_menu' }]
    ]
  };
  
  if (messageId) {
    bot.editMessageText(confirmText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } else {
    bot.sendMessage(chatId, confirmText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

console.log('Demo Degen Bot is running...');
console.log('Fetching real token data from DexScreener API');
