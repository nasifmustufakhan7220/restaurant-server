import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();

app.use(cors());
app.use(express.json());

dotenv.config();

const PORT = process.env.PORT || 5000;

import { MongoClient, ObjectId } from 'mongodb';
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
//get menu
app.get('/vendor/:id/my-menu', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.find({ vendorId: id}).toArray(); 
    res.send(result);
  }catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

//get vendor menu details
app.get('/vendor/menu-details/:id', async (req, res) => {
  try{
    const id = req.params.id;
    const result = await menuCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error('Error fetching menu details:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
})
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
});

//update menu
app.patch('/vendor/update-menu/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const result = await menuCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    res.send(result);
  } catch (error) {
    console.error('Error updating menu:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

