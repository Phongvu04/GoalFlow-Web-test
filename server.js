const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const Goal = require('./models/Goal');
const authMiddleware = require('./middleware/auth');

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

// Khởi tạo và kết nối cơ sở dữ liệu MongoDB
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Xóa những User cũ không có password để tránh lỗi hệ thống jwt
        try {
            const deleted = await User.deleteMany({ password: { $exists: false } });
            if (deleted.deletedCount > 0) {
                console.log(`🗑️ Đã xóa ${deleted.deletedCount} tài khoản hệ thống cũ (không có mật khẩu)`);
            }
        } catch (e) { console.error('Lỗi khi clean up DB:', e); }

    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error);
    }
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

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
            return res.status(400).json({ success: false, error: 'Chỉ chấp nhận địa chỉ @gmail.com' });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Mật khẩu phải từ 6 ký tự trở lên' });
        }

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, error: 'Email đã được đăng ký' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = await User.create({ 
            id: Date.now().toString(), 
            name, 
            email, 
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        // Gửi email chào mừng chạy ngầm
        sendWelcomeEmail(email, name).catch(console.error);

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'Tài khoản không tồn tại' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Mật khẩu không chính xác' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- GOAL ROUTES ---
app.post('/api/goals', authMiddleware, async (req, res) => {
    try {
        const { goals } = req.body;
        const userId = req.user.id;
        
        await Goal.deleteMany({ userId });
        if (goals && goals.length > 0) {
            await Goal.insertMany(goals.map(g => ({ ...g, userId })));
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/goals', authMiddleware, async (req, res) => {
    try {
        const goals = await Goal.find({ userId: req.user.id });
        res.json({ success: true, goals });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
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
app.post('/api/ai/generate-goals', authMiddleware, async (req, res) => {
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

// --- EMAIL NOTIFICATIONS ROUTE ---
app.post('/api/notifications/completion', async (req, res) => {
    try {
        const { userId, email, goalTitle } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Thiếu email để gửi thông báo' });
        }

        const mailOptions = {
            from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🎉 Chúc mừng bạn đã hoàn thành mục tiêu!',
            text: `Chào bạn,

Thật tuyệt vời! Chúng tôi nhận thấy bạn vừa hoàn thành mục tiêu: "${goalTitle}".

Những nỗ lực nhỏ mỗi ngày cuối cùng cũng tạo ra kết quả lớn. Đội ngũ GoalFlow xin gửi lời chúc mừng chân thành nhất đến bạn. Hãy tiếp tục giữ vững phong độ này nhé!

Đừng quên đặt thêm những mục tiêu mới và tiếp tục hành trình phát triển bản thân cùng GoalFlow.

Chúc bạn luôn thành công!

Trân trọng,
Đội ngũ GoalFlow`
        };

        // Gửi email chạy ngầm không cần await để tránh làm chậm UI người dùng
        transporter.sendMail(mailOptions)
            .then(() => console.log(`✅ Completion notification email sent to ${email} for goal "${goalTitle}"`))
            .catch((err) => console.error(`❌ Error sending completion email:`, err.message));
            
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ Lỗi gửi thông báo completion:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cho phép Express đọc các file tĩnh (như styles.css)
app.use(express.static(__dirname));

// Khi có người vào trang chủ ('/'), ném file index.html ra cho họ xem
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server function
async function startServer() {
    await connectDB();
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