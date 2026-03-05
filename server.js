const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');

// Khởi tạo dữ liệu
async function initializeDataStorage() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        try { await fs.access(USERS_FILE); } catch { await fs.writeFile(USERS_FILE, JSON.stringify([])); }
        try { await fs.access(GOALS_FILE); } catch { await fs.writeFile(GOALS_FILE, JSON.stringify([])); }
        console.log('✅ Database initialized');
    } catch (error) { console.error('Init Error:', error); }
}

async function readJSON(filePath) {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return []; }
}
async function writeJSON(filePath, data) {
    try { await fs.writeFile(filePath, JSON.stringify(data, null, 2)); return true; } catch { return false; }
}

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

async function sendWelcomeEmail(toEmail, userName) {
    const mailOptions = {
        from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Chào mừng bạn đến với GoalFlow',
        text: `Chào bạn,

Cảm ơn bạn đã tin tưởng và sử dụng website GoalFlow để quản lý mục tiêu cá nhân của mình. Chúng tôi tạo ra nền tảng này với mong muốn giúp bạn biến những kế hoạch trên giấy thành hành động thực tế mỗi ngày.

Nếu bạn có bất kỳ góp ý hoặc cần hỗ trợ, hãy phản hồi lại email này. Đội ngũ của chúng tôi luôn sẵn sàng đồng hành cùng bạn trên hành trình chinh phục mục tiêu.

Chúc bạn một ngày làm việc hiệu quả và đầy động lực!

Trân trọng.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Welcome email sent to ${toEmail}`);
    } catch (error) {
        console.error(`❌ Error sending email to ${toEmail}:`, error.message);
    }
}

// --- USER ROUTES ---
app.post('/api/users', async (req, res) => {
    try {
        const { id, name, email, createdAt } = req.body;

        // Backend Validation: Chỉ chấp nhận gmail
        if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
            return res.status(400).json({ success: false, error: 'Chỉ chấp nhận địa chỉ @gmail.com' });
        }

        const users = await readJSON(USERS_FILE);
        if (!users.find(u => u.email === email)) {
            users.push({ id, name, email, createdAt });
            await writeJSON(USERS_FILE, users);

            // Gửi email chào mừng lần đầu đăng ký
            await sendWelcomeEmail(email, name);
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- GOAL ROUTES ---
app.post('/api/goals', async (req, res) => {
    try {
        const { userId, goals } = req.body;
        const allGoals = await readJSON(GOALS_FILE);
        const otherGoals = allGoals.filter(g => g.userId !== userId);
        await writeJSON(GOALS_FILE, [...otherGoals, ...goals.map(g => ({ ...g, userId }))]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/goals/:userId', async (req, res) => {
    try {
        const allGoals = await readJSON(GOALS_FILE);
        res.json({ success: true, goals: allGoals.filter(g => g.userId === req.params.userId) });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- AI INTEGRATION (GROQ - LLAMA 3.3) ---
async function callGroqAPI(messages, jsonMode = false) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Thiếu GROQ_API_KEY trong .env");

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            // 👇 ĐÃ SỬA TÊN MODEL MỚI NHẤT TẠI ĐÂY 👇
            model: "llama-3.3-70b-versatile",
            messages: messages,
            temperature: 0.7,
            max_tokens: 1024,
            response_format: jsonMode ? { type: "json_object" } : { type: "text" }
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Lỗi kết nối Groq");
    return data.choices[0].message.content;
}

// 1. Chat API
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        // Chỉ lấy 10 tin nhắn gần nhất
        const recentHistory = history.slice(-10).map(msg => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        }));

        const today = new Date();
        const currentDateStr = today.toISOString().split('T')[0];

        const systemPrompt = {
            role: "system",
            content: `Bạn là trợ lý GoalFlow. Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Luôn đặt câu hỏi để làm rõ mục tiêu. Hôm nay là ngày ${currentDateStr}.`
        };

        const messages = [systemPrompt, ...recentHistory, { role: "user", content: message }];

        console.log("📡 Đang gửi tin nhắn đến Groq (Llama 3.3)...");
        const reply = await callGroqAPI(messages);

        res.json({ success: true, response: reply });
    } catch (error) {
        console.error("❌ Groq Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Generate Goals API
app.post('/api/ai/generate-goals', async (req, res) => {
    try {
        const { chatHistory, timeframe } = req.body;
        const conversation = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');

        const today = new Date();
        const currentDateStr = today.toISOString().split('T')[0];

        const prompt = `
        Hôm nay là ngày ${currentDateStr}. Hãy dựa vào ngày hiện tại để tính toán và thiết lập thời gian mục tiêu (deadline) bằng định dạng YYYY-MM-DD cho chuẩn xác với mong muốn của người dùng.
        Người dùng muốn hoàn thành CÁC mục tiêu này trong khoảng thời gian tóm gọn là: ${timeframe || 'chưa xác định'}.
        QUAN TRỌNG VỀ ĐỘ ƯU TIÊN VÀ THỜI GIAN:
        - Phân chia đều thời gian một cách logic trong khoảng thời gian đã cho.
        - Với một mục tiêu ưu tiên cao (high), điều đó đòi hỏi nhiều thời gian và nỗ lực hơn, vì vậy thời hạn để hoàn thành nó (deadline từ giờ đến mục tiêu) NÊN DÀI HƠN hẳn so với những mục tiêu ưu tiên thấp (low) hoặc trung bình (medium) trong cùng một khoảng thời gian tổng thể.
        
        Dựa trên cuộc hội thoại sau, hãy trích xuất 3-5 mục tiêu SMART.
        Hội thoại:
        ${conversation}

        Yêu cầu: Trả về JSON object với cấu trúc:
        {
            "goals": [
                {"title": "...", "description": "...", "category": "monthly", "deadline": "YYYY-MM-DD", "priority": "high"}
            ]
        }
        Chỉ trả về JSON, không giải thích thêm.
        `;

        console.log("📡 Đang yêu cầu Groq tạo mục tiêu...");
        const jsonString = await callGroqAPI([
            { role: "system", content: "Bạn là máy tạo JSON." },
            { role: "user", content: prompt }
        ], true);

        const result = JSON.parse(jsonString);

        const validGoals = (result.goals || []).map(g => ({
            ...g,
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            category: ['weekly', 'monthly', 'yearly', 'long-term'].includes(g.category) ? g.category : 'monthly',
            priority: ['high', 'medium', 'low'].includes(g.priority) ? g.priority : 'medium',
            deadline: g.deadline || new Date().toISOString().split('T')[0]
        }));

        res.json({ success: true, goals: validGoals });

    } catch (error) {
        console.error("❌ Generate Error:", error.message);
        res.json({
            success: true,
            goals: [{
                title: "Mục tiêu mẫu (Do lỗi kết nối)",
                description: "Hãy tự sửa mục tiêu này nhé.",
                category: "monthly",
                priority: "medium",
                deadline: new Date().toISOString().split('T')[0]
            }]
        });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
// Cho phép Express đọc các file tĩnh (như styles.css)
app.use(express.static(__dirname));

// Khi có người vào trang chủ ('/'), ném file index.html ra cho họ xem
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server function
async function startServer() {
    await initializeDataStorage();
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════╗
║      GoalFlow Server Running         ║
║  Port: ${PORT}                          ║
║  Model: Groq (Llama 3.3)             ║
╚══════════════════════════════════════╝
        `);
    });
}

startServer();