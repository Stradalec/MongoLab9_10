const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    name: String,
    author: String,
    date: { type: Date, required: true },
    tags: String,
    content: [String],
    reviews: [
        {
            name: String,
            text: String,
            score: Number
        }
    ]
}, { versionKey: false });

module.exports = mongoose.model('articles', articleSchema, "articles");