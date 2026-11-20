import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();

app.use(cors());
app.use(express.json());

dotenv.config();

const PORT = process.env.PORT || 5000;

import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.MONGO_URL);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectMongoClient = await connectToMongoDB();
const db = connectMongoClient.db("pizza-hub");
const menuCollection = db.collection("menu");


app.get('/', (req, res) => {
  res.send('Hello, World!');
});



// vendor routes
//add menu

app.post('/vendor/add-menu',async (req, res) => {
  try {
    const menuData = req.body;
    const result = await menuCollection.insertOne(menuData);
    res.status(201).send(result);
  } catch (error) {
    console.error('Error adding menu:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
})
// vendor routes
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

