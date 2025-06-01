const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    name: String,
    author: String,
    date: Date,
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