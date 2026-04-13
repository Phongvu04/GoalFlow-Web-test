const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },
    category: { type: String, default: 'monthly' },
    deadline: { type: String },
    priority: { type: String, default: 'medium' },
    status: { type: String, default: 'in-progress' },
    userId: { type: String, required: true },
    createdAt: { type: String },
    completedAt: { type: String },
    updatedAt: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Goal', goalSchema);
