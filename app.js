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
        const rawArticles = JSON.parse(jsonData);
        const articles = rawArticles.map(article => ({
            ...article,
            date: new Date(article.date)
        }));

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
                const { author, startDate, endDate, searchQuery } = req.query;

                let data, fields;
                const filter = {};
                if (searchQuery) {
                    filter.name = { $regex: new RegExp(searchQuery, 'i') };
                }

                if (author && author !== 'all') {
                    filter.author = author;
                }
                if (startDate || endDate) {
                    filter.date = {};

                    if (startDate) {
                        const start = new Date(startDate);
                        start.setUTCHours(0, 0, 0, 0);
                        filter.date.$gte = start;
                    }

                    if (endDate) {
                        const end = new Date(endDate);
                        end.setUTCHours(23, 59, 59, 999);
                        filter.date.$lte = end;
                    }

                    console.log('UTC Фильтр:', {
                        gte: filter.date.$gte?.toISOString(),
                        lte: filter.date.$lte?.toISOString()
                    });
                }


                if (isTop) {
                    data = await Article.aggregate([
                        { $match: filter },
                        { $unwind: "$reviews" },
                        {
                            $group: {
                                _id: "$_id",
                                name: { $first: "$name" },
                                author: { $first: "$author" },
                                date: { $first: { $toDate: "$date" } },
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

                    data = data.map(item => ({
                        ...item,
                        avgScore: item.avgScore !== null ? item.avgScore : 0
                    }));

                    fields = ['name', 'author', 'date', 'avgScore', 'totalReviews'];
                } else {

                    data = await Article.find(filter, { reviews: 0 });
                    fields = ['name', 'author', 'date', 'tags']; 
                }
                console.log('Фильтр:', filter);
                console.log('Найдено документов:', data.length);
                

                res.render('articles', {
                    collection: 'articles',
                    fields,
                    data,
                    authors,
                    currentAuthor: req.query.author || 'all',
                    isTop,
                    currentStartDate: startDate || '',
                    currentEndDate: endDate || '',
                    currentSearchQuery: searchQuery || ''
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
