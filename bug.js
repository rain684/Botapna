const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  delay
} = require('@whiskeysockets/baileys');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Config utility simulation
const config = {
  bot: {
    mode: "private" // Default mode
  }
};

// Bot state management
class BotState {
  constructor() {
    this.isSpamming = false;
    this.botStartTime = new Date();
    this.waitingForCount = new Map(); // Track users waiting for count input
    this.spamIntervals = new Map(); // Track spam intervals for each user
    this.allowedChats = new Set(); // Track chats where bot is allowed
    this.blockedChats = new Set(); // Track chats where bot is blocked
  }

  getUptime() {
    const now = new Date();
    const diff = now - this.botStartTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  stopAllSpam() {
    this.isSpamming = false;
    // Clear all spam intervals
    for (const intervalId of this.spamIntervals.values()) {
      clearInterval(intervalId);
    }
    this.spamIntervals.clear();
  }

  // Check if bot is allowed in this chat
  isAllowed(chatId) {
    // If chat is specifically blocked, deny access
    if (this.blockedChats.has(chatId)) {
      console.log(`Chat ${chatId} is blocked`);
      return false;
    }
    
    // If chat is specifically allowed, grant access
    if (this.allowedChats.has(chatId)) {
      console.log(`Chat ${chatId} is allowed`);
      return true;
    }
    
    // Default: allow in all chats
    console.log(`Chat ${chatId} using default access`);
    return true;
  }

  // Allow bot in specific chat
  allowChat(chatId) {
    this.allowedChats.add(chatId);
    this.blockedChats.delete(chatId); // Remove from blocked if present
    console.log(`Chat ${chatId} added to allowed list`);
  }

  // Block bot in specific chat
  blockChat(chatId) {
    this.blockedChats.add(chatId);
    this.allowedChats.delete(chatId); // Remove from allowed if present
    console.log(`Chat ${chatId} added to blocked list`);
  }
}

// Initialize bot state
const botState = new BotState();

async function startBot() {
  // Ensure auth directory exists
  const authDir = './auth_info_baileys';
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    browser: ['Ubuntu', 'Chrome', '22.04.4'],
    printQRInTerminal: true,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('🔶 Scan the QR code above to login');
    }
    
    if (connection === 'connecting') {
      console.log('⏳ Connecting to WhatsApp...');
    }
    
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('Connection closed with reason:', reason);
      
      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔄 Connection lost, reconnecting...');
        startBot();
      } else {
        console.log('🔒 Session terminated. Please delete the auth folder to restart.');
        process.exit(0);
      }
    }
    
    if (connection === 'open') {
      console.log('✅ Successfully connected to WhatsApp!');
      console.log('🤖 Bot is now operational');
    }
  });

  // Handle authentication
  const credsPath = path.join(authDir, 'creds.json');
  if (!fs.existsSync(credsPath)) {
    console.log('🔐 No existing session found, initiating authentication...');
    const phoneNumber = await ask('📱 Enter your phone number (with country code): ');
    console.log('🔗 Generating pairing code...');
    
    try {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`🔢 Pairing Code: ${code}`);
      console.log('👉 Please enter this code in your WhatsApp linked devices section');
    } catch (error) {
      console.error('❌ Failed to generate pairing code:', error);
    }
  }

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const isMe = msg.key.fromMe;
      const isGroup = from.endsWith('@g.us');
      const reply = (txt) => sock.sendMessage(from, { text: txt });

      // Debug log
      console.log(`Received message from ${from}: ${text}, isMe: ${isMe}`);

      // ======= ALLOW HERE Command =======
      if (text === '.allow here' && isMe) {
        botState.allowChat(from);
        reply('✅ Bot enabled in this chat');
        return;
      }

      // ======= NOT ALLOW HERE Command =======
      if (text === '.not allow here' && isMe) {
        botState.blockChat(from);
        reply('❌ Bot disabled in this chat');
        return;
      }

      // Check if bot is allowed in this chat (skip for allow/not allow commands)
      if (!botState.isAllowed(from)) {
        console.log(`Ignoring message from blocked chat: ${from}`);
        return; // Silent ignore if not allowed
      }

      // Check if user is authorized based on config mode
      if (config.bot.mode === "private" && !isMe && text !== '.ping') {
        console.log(`Ignoring command from non-owner in private mode: ${text}`);
        return;
      }

      // Check if user is waiting for count input
      if (botState.waitingForCount.has(from) && !text.startsWith('.')) {
        const { bugText } = botState.waitingForCount.get(from);
        botState.waitingForCount.delete(from);

        if (text.toLowerCase() === 'cancel') {
          reply('❌ Operation cancelled.');
          return;
        }

        // Parse count from the message
        let count = 0;
        const countMatch = text.toLowerCase().match(/c\s*(\d+)/);
        
        if (countMatch) {
          count = parseInt(countMatch[1]);
          await handleBugCommand(sock, from, bugText, count, reply);
        } else {
          reply('⚠️ Please specify count with format: c<number> (e.g., c10)');
        }
        return;
      }

      // ======= PING Command (Always available) =======
      if (text === '.ping') {
        const pingMsg = `
╔══════════════════════╗
       BOT STATUS        
╠══════════════════════╣
📛 Name:    HCO BOT
🔊 Status:  ONLINE ✅
⏰ Uptime:  ${botState.getUptime()}
👤 User:    Rain
🔐 Mode:    ${config.bot.mode === 'private' ? 'PRIVATE 🛡️' : 'PUBLIC 🌐'}
💬 Chats:   ${botState.allowedChats.size} allowed, ${botState.blockedChats.size} blocked
🔄 Version: v1.0.6
🌐 Server:  India
╚══════════════════════╝`;
        reply(pingMsg);
        return;
      }

      // ======= TAGALL Command =======
      if (text === '.tagall') {
        // Check if user is authorized
        if (config.bot.mode === "private" && !isMe) {
          reply("❌ This command is for owner only!");
          return;
        }
        
        try {
          // Only works in groups
          if (!isGroup) {
            return reply("❌ This command only works in groups!");
          }

          // Fetch group metadata
          const metadata = await sock.groupMetadata(from).catch(() => null);
          if (!metadata) return reply("⚠️ Failed to fetch group information");

          const participants = metadata.participants || [];
          if (participants.length === 0) return reply("⚠️ No members found in this group");

          // Create mentions
          const mentions = participants.map(p => p.id);
          const mentionText = participants.map((p, i) => `${i + 1}. @${p.id.split("@")[0]}`).join("\n");

          // Send message with mentions
          await sock.sendMessage(from, {
            text: `📢 *Group Mention*\n\n${mentionText}`,
            mentions
          }, { quoted: msg });

        } catch (err) {
          console.error("Tagall error:", err);
          reply("⚠️ Error while tagging members");
        }
        return;
      }

      // ======= MODE Command (Owner Only) =======
      if (isMe && text.toLowerCase().startsWith('.mode ')) {
        const newMode = text.toLowerCase().split(' ')[1];
        if (newMode === 'pub' || newMode === 'public') {
          config.bot.mode = 'public';
          reply("✅ Mode changed to Public. Everyone can use commands now.");
        } else if (newMode === 'priv' || newMode === 'private') {
          config.bot.mode = 'private';
          reply("✅ Mode changed to Private. Only you can use commands now.");
        } else {
          reply("⚠️ Invalid mode. Use '.mode pub' or '.mode priv'");
        }
        return;
      }

      // ======= STOP Command =======
      if (text.toLowerCase() === '.stop') {
        // Check if user is authorized
        if (config.bot.mode === "private" && !isMe) {
          reply("❌ This command is for owner only!");
          return;
        }
        
        if (botState.spamIntervals.has(from)) {
          clearInterval(botState.spamIntervals.get(from));
          botState.spamIntervals.delete(from);
          botState.isSpamming = false;
          reply("🛑 Spam stopped.");
        } else {
          reply("⚠️ No active spam session.");
        }
        return;
      }

      // ======= BUG Command =======
      if (text.toLowerCase().startsWith('.bug ')) {
        // Check if user is authorized
        if (config.bot.mode === "private" && !isMe) {
          reply("❌ This command is for owner only!");
          return;
        }
        
        // Extract the full text after "bug"
        const fullText = text.substring(5).trim();
        
        // Parse the command - support formats: "bug text c10" or "bug text"
        const countMatch = fullText.match(/(.+?)\s+c\s*(\d+)$/i) || fullText.match(/(.+?)\s+c(\d+)$/i);
        
        let bugText, count;
        
        if (countMatch) {
          // Format: "bug text c10"
          bugText = countMatch[1].trim();
          count = parseInt(countMatch[2]);
        } else {
          // Format: "bug text" - will ask for count
          bugText = fullText;
          count = null;
        }

        if (!bugText) {
          reply("⚠️ Please provide text after 'bug' command.");
          return;
        }

        // If count is provided directly in the command
        if (count !== null) {
          await handleBugCommand(sock, from, bugText, count, reply);
        } else {
          // If count is not provided, ask for it
          botState.waitingForCount.set(from, { bugText });
          reply(`📝 Text: "${bugText}"\n🔢 Please specify count with format: c<number>`);
        }
        return;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle bug command execution
  async function handleBugCommand(sock, from, bugText, count, reply) {
    try {
      if (count > 0) {
        reply(`🔄 Sending "${bugText}" ${count} times...`);
        
        // Send messages in batches for maximum speed
        const batchSize = 10;
        const batches = Math.ceil(count / batchSize);
        
        for (let batch = 0; batch < batches; batch++) {
          const promises = [];
          const remaining = count - (batch * batchSize);
          const currentBatchSize = Math.min(batchSize, remaining);
          
          for (let i = 0; i < currentBatchSize; i++) {
            promises.push(sock.sendMessage(from, { text: bugText }));
          }
          
          // Send batch and wait a very short time
          await Promise.all(promises);
          if (batch < batches - 1) await delay(100); // Minimal delay between batches
        }
        
        reply(`✅ "${bugText}" sent ${count} times!`);
      } else if (count === 0) {
        botState.isSpamming = true;
        reply(`♾ Infinite mode activated! Sending "${bugText}" continuously. Type '.stop' to end.`);

        // Use interval for more reliable infinite spam
        const intervalId = setInterval(async () => {
          try {
            await sock.sendMessage(from, { text: bugText });
          } catch (error) {
            console.error('Error sending spam message:', error);
            clearInterval(intervalId);
            botState.spamIntervals.delete(from);
          }
        }, 1000);
        
        botState.spamIntervals.set(from, intervalId);
      }
    } catch (error) {
      console.error('Error in handleBugCommand:', error);
      reply('❌ Error sending messages');
    }
  }

  sock.ev.on('creds.update', saveCreds);
}

// Start the bot
startBot().catch(console.error);
