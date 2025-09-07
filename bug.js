
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
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
    mode: "private", // Default mode
    memberMode: false // Member mode disabled by default
  }
};

// Bot state management
class BotState {
  constructor() {
    this.botStartTime = new Date();
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

  // Check if bot is allowed in this chat
  isAllowed(chatId) {
    // If chat is specifically blocked, deny access
    if (this.blockedChats.has(chatId)) {
      return false;
    }

    // If chat is specifically allowed, grant access
    if (this.allowedChats.has(chatId)) {
      return true;
    }

    // Default: allow in all chats
    return true;
  }

  // Allow bot in specific chat
  allowChat(chatId) {
    this.allowedChats.add(chatId);
    this.blockedChats.delete(chatId);
  }

  // Block bot in specific chat
  blockChat(chatId) {
    this.blockedChats.add(chatId);
    this.allowedChats.delete(chatId);
  }
}

// Initialize bot state
const botState = new BotState();

// Define all menu commands with their links
const menuCommands = {
  'kali nethunter': 'https://youtu.be/JzIn3655Tl8',
  'facebook hack': 'https://youtu.be/_fC0Eju8uMo',
  'instagram hack': 'https://youtu.be/_fC0Eju8uMo',
  'whatsapp hack': 'https://fb.watch/cuiRNh3Qoh/',
  'ddos attack': 'https://fb.watch/zbsARZ17C-/',
  'termux x11': 'https://youtu.be/hKypVQuA7yk',
  'zip cracker': 'https://youtu.be/6_VDrJAJyuE',
  'wordlist path': 'https://youtu.be/pfYxcLDqBfE?si=GsB8d8jbcqoprBNX',
  'free proxy': 'https://youtu.be/p48HTajO38Y',
  'bug bounty part -1': 'https://youtu.be/8ICn2KeBzoU',
  'bug bounty part -2': 'https://youtu.be/QI5Yg9PbO6k',
  'cupp tool': 'https://youtu.be/p-clBzzIyy4',
  'hydra tool': 'https://youtu.be/p-clBzzIyy4',
  'fake email': 'https://youtu.be/swhK_OfEFNw',
  'learn coding': 'https://youtu.be/JN6HZvgTlbw?si=qnRbwnyBsBb9FuiW',
  'hacking class': 'https://youtu.be/p-clBzzIyy4',
  'password hack': 'https://youtu.be/lA8s2-Tgj5Y',
  'hackers colony official': 'https://youtube.com/channel/UCXnBZRpLD7QzcJsUKBF-cKw',
  'hackers colony tech': 'https://youtube.com/channel/UCEey4KPWqWGGktb4Me8exeA',
  'hackers colony': 'https://youtube.com/channel/UCdoWbP5TmqnrbpenTF7npSA',
  'routersploit': 'https://youtu.be/zqNtEu0upVw',
  'ransomware': 'https://youtu.be/JH1XsItFbbs',
  'android pentesting': 'https://youtu.be/niyI-LJlnWw',
  'metasploit': 'https://youtu.be/BBT-T33Hf2k',
  'gmail hack': 'https://youtu.be/MlNrxlhuqXQ',
  'wordlist': 'https://youtu.be/UOlDFFXz8v4',
  'install kali linux': 'https://youtu.be/qIrAE8O0QyE',
  'termux tutorial part - 1': 'https://youtu.be/UjpvEPvqL2c',
  'termux tutorial part - 2': 'https://youtu.be/Dj4ncHFrkg0',
  'ngrok masking': 'https://youtu.be/nNLS_f8BS88',
  'hacking phone': 'https://youtu.be/p-clBzzIyy4',
  'hide link': 'https://youtu.be/aKyKYL-GM90',
  'find phone': 'https://youtu.be/UTEfrqzVBB0',
  'social engineering': 'https://youtu.be/p-clBzzIyy4',
  'hacking tool': 'https://youtu.be/p-clBzzIyy4',
  'how to hack instagram in termux': 'https://fb.watch/lMAqqa4bL2/?mibextid=Nif5oz',
  'how to hack facebook in termux': 'https://fb.watch/lMAwUotjsE/?mibextid=Nif5oz',
  'how to run and install phonesploit in termux': 'https://fb.watch/lMAZLRICsM/?mibextid=Nif5oz',
  'install and run venom tool in termux': 'https://fb.watch/lMB0_ZYuER/?mibextid=Nif5oz',
  'how to gather anyone\'s facebook information using termux': 'https://fb.watch/lMB4mtajvZ/?mibextid=Nif5oz',
  'how to install metasploit in termux': 'https://fb.watch/lMBjhGPdGq/?mibextid=Nif5oz',
  'how to root android phone': 'https://youtu.be/F52qX6srgyU',
  'bug bounty in termux': 'https://youtu.be/w1FF1YoF1Yk',
  'whatsapp bombing using termux': 'https://youtu.be/28ZebW9qNY8',
  'how to install kali nethunter in android': 'https://youtu.be/yH1HVc523zU',
  'termux tool': 'https://youtu.be/lnCfrutxfgM',
  'virtual phone': 'https://youtu.be/BqaLJM357CM',
  'hacking link': 'https://youtu.be/istQKYc1ebw',
  'termux toolkit': 'https://youtu.be/uOgpi-o-qG8',
  'info gathering': 'https://youtu.be/e5_gxM1eQKQ',
  'key logger': 'https://youtu.be/Ye-_iAjxIkU',
  'scope hunter': 'https://youtu.be/w1FF1YoF1Yk',
  'ss7 attack': 'https://youtu.be/jU4omNHuIdA',
  'install adb': 'https://youtu.be/mJQuQ4UHku0',
  'recover photos': 'https://youtu.be/iITgUcE3V1I',
  'recover facebook account': 'https://youtu.be/QHB5FKnSVis',
  'report facebook account': 'https://youtu.be/QHB5FKnSVis',
  'whatsapp bombing': 'https://youtu.be/FyPrhNYTxiM',
  'hack website': 'https://www.facebook.com/1987580371566058/videos/4210170685677495/',
  'root termux': 'https://youtu.be/WCwOhcLFxSA',
  'usb rubber ducky': 'https://youtu.be/7lDaarWfG-M?si=lqnw47Yrg30__PB0',
  'learn hacking': 'https://www.facebook.com/1987580371566058/posts/3260475117609904/',
  'powerful tool': 'https://youtu.be/IXdL1x1gpLU',
  'whatsapp unban': 'https://youtu.be/lmhm4pCPidU',
  'premium app': 'https://youtu.be/j-Vd2zGL8NM',
  'hack wifi': 'https://youtu.be/zqNtEu0upVw',
  'whatsapp virus': 'https://fb.watch/cuhjvAn5Sa/',
  'sms bombing': 'https://www.instagram.com/tv/Ccc4nGflJsz/?igshid=YmMyMTA2M2Y=',
  'earn money online': 'https://youtu.be/BRHr50K4BEk',
  'payload': 'https://fb.watch/bOy6hrzwxR/',
  'install ngrok': 'https://fb.watch/bOz6eBZcHF/',
  'fake number': 'https://youtu.be/swhK_OfEFNw',
  'ip hack': 'https://youtu.be/e7ogIDP5BPg',
  'whatsapp crashing': 'https://www.instagram.com/tv/Ccc4nGflJsz/?igshid=YmMyMTA2M2Y=',
  'whatsapp malware': 'https://youtu.be/SU7DED9acwA',
  'wifi hack': 'https://youtu.be/kNatFf10f9U',
  'rat tool': 'https://fb.watch/naFsefQ8EB/?mibextid=Nif5oz',
  'be a hacker': 'https://youtu.be/k9bTYNC1J8s',
  'phishing': 'https://fb.watch/ct4ZvgnpoM/',
  'tool x': 'https://youtu.be/V8JfmHcCi3A',
  'sim cloning': 'https://youtu.be/mUQo2C3jHwE',
  'termux package': 'https://youtu.be/hKypVQuA7yk',
  'unlimited otp': 'https://youtu.be/BKJuwDDcn84',
  'apk tool': 'https://youtu.be/4G1uQQ0fEwc',
  'nikto tool': 'https://youtu.be/p-clBzzIyy4',
  'dark eagle': 'https://youtu.be/g69K-lI4c7A',
  'free fire hack': 'https://youtu.be/d3phSxOgMRo',
  'hack location': 'https://youtu.be/SnRTRj1INhE?si=Gc4k0nZPdD_MpV5Y'
};

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
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
  });

  // Handle authentication
  const credsPath = path.join(authDir, 'creds.json');
  if (!fs.existsSync(credsPath)) {
    const phoneNumber = await ask('Enter your phone number (with country code): ');
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(`Pairing Code: ${code}`);
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
      const sender = msg.key.participant || msg.key.remoteJid;

      // ======= HELP Command =======
      if (text === '.help') {
        const helpMessage = `🤖 *HCO BOT HELP MENU* 🤖

📋 *TOTAL COMMANDS:* ${Object.keys(menuCommands).length + 5}

👥 *PUBLIC COMMANDS (Everyone can use):*
• .help - Show this help menu
• .ping - Check bot status
• menu/.menu/Menu - Show all available commands

🔧 *MEMBER COMMANDS (When member mode is on):*
• All menu commands (${Object.keys(menuCommands).length}+ commands)

🛡️ *OWNER COMMANDS (Only you can use):*
• .allow here - Enable bot in this chat
• .not allow here - Disable bot in this chat
• .mode <public/private/member> - Change bot mode
• .tagall - Tag all group members

📊 *CURRENT MODE:* ${config.bot.mode === 'private' ? 'PRIVATE 🛡️' : config.bot.mode === 'public' ? 'PUBLIC 🌐' : 'MEMBER 👥'}
🔓 *MEMBER MODE:* ${config.bot.memberMode ? 'ON ✅' : 'OFF ❌'}

💡 *Tip:* Use any menu command to get video tutorials!`;

        await sock.sendMessage(from, {
          text: helpMessage,
          mentions: [sender]
        }, { quoted: msg });
        return;
      }

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

      // Check if bot is allowed in this chat
      if (!botState.isAllowed(from)) {
        return;
      }

      // Check if user is authorized based on config mode
      const isPublicMode = config.bot.mode === "public";
      const isMemberMode = config.bot.mode === "member" && config.bot.memberMode;

      if (config.bot.mode === "private" && !isMe && text !== '.ping' && text !== '.help') {
        return;
      }

      // ======= MODE Command (Owner Only) =======
      if (isMe && text.toLowerCase().startsWith('.mode ')) {
        const newMode = text.toLowerCase().split(' ')[1];
        if (newMode === 'pub' || newMode === 'public') {
          config.bot.mode = 'public';
          config.bot.memberMode = false;
          reply("✅ Mode changed to Public. Everyone can use all commands now.");
        } else if (newMode === 'priv' || newMode === 'private') {
          config.bot.mode = 'private';
          config.bot.memberMode = false;
          reply("✅ Mode changed to Private. Only you can use commands now.");
        } else if (newMode === 'member') {
          const subCommand = text.toLowerCase().split(' ')[2];
          if (subCommand === 'on') {
            config.bot.mode = 'member';
            config.bot.memberMode = true;
            reply("✅ Member mode activated! Everyone can use menu commands now.");
          } else if (subCommand === 'off') {
            config.bot.memberMode = false;
            reply("✅ Member mode deactivated!");
          } else {
            reply("⚠️ Use '.mode member on' or '.mode member off'");
          }
        } else {
          reply("⚠️ Invalid mode. Use '.mode pub', '.mode priv', or '.mode member on/off'");
        }
        return;
      }

      // ======= MENU Command =======
      if (text.toLowerCase() === 'menu' || text === '.menu' || text === 'Menu') {
        // Check authorization for menu command
        if (config.bot.mode === "private" && !isMe && !config.bot.memberMode) {
          return;
        }

        const menuMessage = `⛓️⚡ *WELCOME TO HACKERS MENU* ⚡⛓️
🕶️ *Type any Keyword & Unlock Dark Power* 🕶️

[👨‍💻 *HACKING & SECURITY*]
🔥 kali nethunter
🔥 facebook hack
🔥 instagram hack
🔥 whatsapp hack
🔥 ddos attack
🔥 zip cracker
🔥 wordlist path
🔥 free proxy
🔥 bug bounty part-1
🔥 bug bounty part-2
🔥 cupp tool
🔥 hydra tool
🔥 password hack
🔥 routersploit
🔥 ransomware
🔥 android pentesting
🔥 metasploit
🔥 gmail hack
🔥 wordlist
🔥 hacking phone
🔥 social engineering
🔥 hacking tool
🔥 how to hack instagram in termux
🔥 how to hack facebook in termux
🔥 phonesploit in termux
🔥 venom tool in termux
🔥 facebook info gathering
🔥 install metasploit in termux
🔥 root android phone
🔥 bug bounty in termux
🔥 whatsapp bombing in termux
🔥 install kali nethunter in android
🔥 hacking link
🔥 info gathering
🔥 key logger
🔥 scope hunter
🔥 ss7 attack
🔥 hack website
🔥 wifi hack
🔥 whatsapp virus
🔥 rat tool
🔥 phishing
🔥 tool x
🔥 sim cloning
🔥 nikto tool
🔥 free fire hack
🔥 hack location

[📲 *TERMUX & TOOLS*]
💻 termux x11
💻 install kali linux
💻 termux tutorial part -1
💻 termux tutorial part -2
💻 ngrok masking
💻 hide link
💻 find phone
💻 termux tool
💻 virtual phone
💻 termux toolkit
💻 install adb
💻 termux package
💻 apk tool
💻 dark eagle

[🛠 *UTILITIES*]
⚡ fake email
⚡ learn coding
⚡ hacking class
⚡ recover photos
⚡ recover facebook account
⚡ report facebook account
⚡ root termux
⚡ usb rubber ducky
⚡ learn hacking
⚡ powerful tool
⚡ whatsapp unban
⚡ premium app
⚡ sms bombing
⚡ earn money online
⚡ payload
⚡ install ngrok
⚡ fake number
⚡ ip hack
⚡ whatsapp crashing
⚡ whatsapp malware
⚡ be a hacker
⚡ unlimited otp
⚡ email bombing

[🎬 *CHANNELS*]
📡 hackers colony official
📡 hackers colony tech
📡 hackers colony

🌀 *Stay Anonymous – Stay Powerful* 💀`;

        // Send message with mention
        await sock.sendMessage(from, {
          text: menuMessage,
          mentions: [sender]
        }, { quoted: msg });
        return;
      }

      // ======= CHECK ALL MENU COMMANDS =======
      const normalizedText = text.toLowerCase().trim();
      if (menuCommands[normalizedText]) {
        // Check authorization for menu commands
        if (config.bot.mode === "private" && !isMe && !config.bot.memberMode) {
          reply("❌ This command is for owner only!");
          return;
        }

        const commandName = normalizedText;
        const commandLink = menuCommands[normalizedText];

        const responseMessage = `*${commandName.toUpperCase()}*
                                                      
𝗜𝗺 𝗛𝗮𝗰𝗸𝗲𝗿𝘀 𝗖𝗼𝗹𝗼𝗻𝘆 𝗕𝗼𝘁🤖
𝗜𝗺 𝗿𝗲𝗽𝗹𝘆𝗶𝗻𝗴 𝗼𝗻 𝗯𝗲𝗵𝗮𝗹𝗳 𝗼𝗳 𝗔𝗱𝗺𝗶𝗻𝘀.
👇👇👇👇👇👇👇👇👇👇👇

Click the link below to watch video
👇👇👇👇👇👇👇          
     
${commandLink}`;

        // Send message with mention
        await sock.sendMessage(from, {
          text: responseMessage,
          mentions: [sender]
        }, { quoted: msg });
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
🔐 Mode:    ${config.bot.mode === 'private' ? 'PRIVATE 🛡️' : config.bot.mode === 'public' ? 'PUBLIC 🌐' : 'MEMBER 👥'}
🔓 Member:  ${config.bot.memberMode ? 'ON ✅' : 'OFF ❌'}
💬 Chats:   ${botState.allowedChats.size} allowed, ${botState.blockedChats.size} blocked
🔄 Version: v1.0.7
🌐 Server:  India
╚══════════════════════╝`;
        reply(pingMsg);
        return;
      }

      // ======= TAGALL Command =======
      if (text === '.tagall') {
        // Check if user is authorized
        if (!isMe) {
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
          reply("⚠️ Error while tagging members");
        }
        return;
      }

    } catch (error) {
      // Silent error handling
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Start the bot
startBot().catch(() => {});
