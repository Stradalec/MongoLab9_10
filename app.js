require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
const Article = require('./models/Article.js');

async function importArticles() {
    try {

        const jsonData = fs.readFileSync('./data/articles.json', 'utf-8');
        const articles = JSON.parse(jsonData);


        const count = await Article.countDocuments();
        if (count === 0) {
            await Article.insertMany(articles);
            console.log('Данные успешно импортированы');
        } else {
            console.log('В коллекции уже есть документы, импорт пропущен');
        }
    } catch (err) {
        console.error('Ошибка импорта:', err);
    }
}

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Подключена база данных');
        await importArticles();

        app.get('/', async (req, res) => {
            try {
                const authors = await Article.distinct('author');
                const isTop = req.query.top === 'true';
                const { author, startDate, endDate } = req.query;

                let data, fields;
                const filter = {};
                if (author && author !== 'all') {
                    filter.author = author;
                }
                if (startDate || endDate) {
                    filter.date = {};

                    if (startDate) {
                        const start = new Date(startDate);
                        start.setHours(0, 0, 0, 0);
                        filter.date.$gte = start;
                    }

                    if (endDate) {
                        const end = new Date(endDate);
                        end.setHours(23, 59, 59, 999);
                        filter.date.$lte = end;
                    }
                }

                if (isTop) {
                    data = await Article.aggregate([
                        { $unwind: "$reviews" },
                        {
                            $group: {
                                _id: "$_id",
                                name: { $first: "$name" },
                                author: { $first: "$author" },
                                date: { $first: "$date" },
                                avgScore: { $avg: "$reviews.score" },
                                totalReviews: { $sum: 1 }
                            }
                        },
                        {
                            $sort: {
                                avgScore: -1,
                                totalReviews: -1
                            }
                        },
                        { $limit: 10 }
                    ]);

                    fields = ['name', 'author', 'date', 'avgScore', 'totalReviews'];
                } else {

                    data = await Article.find(filter, { reviews: 0 });
                    fields = Object.keys(Article.schema.paths)
                        .filter(f => f !== 'reviews' && f !== '__v');
                }

                res.render('articles', {
                    collection: 'articles',
                    fields,
                    data,
                    authors,
                    currentAuthor: req.query.author || 'all',
                    isTop,
                    currentStartDate: startDate || '',
                    currentEndDate: endDate || ''
                });
            } catch (err) {
                res.status(500).send(err.message);
            }
        });




        app.get('/articles/add', (req, res) => {
            const fields = Object.keys(Article.schema.paths).filter(f => !['__v'].includes(f));
            res.render('add', {
                collection: 'articles',
                fields
            });
        });

        app.post('/articles/add', async (req, res) => {
            try {
                delete req.body._id;
                const newDoc = new Article(req.body);
                await newDoc.save();
                res.redirect('/');
            } catch (err) {
                res.status(500).send(err.message);
            }
        });

        app.get('/articles/:id', async (req, res) => {
            try {
                const article = await Article.findById(req.params.id);
                if (!article) return res.status(404).send('Статья не найдена');
                res.render('article', { article });
            } catch (err) {
                res.status(500).send(err.message);
            }
        });

        app.post('/articles/delete/:id', async (req, res) => {
            try {
                await Article.findByIdAndDelete(req.params.id);
                res.redirect('/');
            } catch (err) {
                res.status(500).send(err.message);
            }
        });
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Сервер работает на порту: ${PORT}`));

    } catch (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    }
}

startServer();
