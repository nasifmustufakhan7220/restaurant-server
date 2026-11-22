import express from "express";
import cors from "cors";
import dotenv from "dotenv";

const app = express();

app.use(cors());
app.use(express.json());

dotenv.config();

const PORT = process.env.PORT || 5000;

import { MongoClient, ObjectId } from "mongodb";
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
const usersCollection = db.collection("user");
const menuCollection = db.collection("menu");

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// vendor routes
//get menu
app.get("/vendor/:id/my-menu", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.find({ vendorId: id }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching menu:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//get vendor menu details
app.get("/vendor/menu-details/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error("Error fetching menu details:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
//add menu
app.post("/vendor/add-menu", async (req, res) => {
  try {
    const menuData = req.body;
    const result = await menuCollection.insertOne(menuData);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error adding menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//update menu
app.patch("/vendor/update-menu/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const result = await menuCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    res.send(result);
  } catch (error) {
    console.error("Error updating menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//delete menu
app.delete("/vendor/delete-menu/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.deleteOne({ _id: new ObjectId(id) });
    //need to add another checks if this item is deleted from the vendor database then we need to delete this item from other collections as well.
    res.send(result);
  } catch (error) {
    console.error("Error deleting menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// vendor routes

// admin routes

//getAllUsers

app.get("/admin/get-all-users", async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    res.send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// get user Details

app.get("/admin/get-user-details/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    res.send(user);
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/admin/get-all-menu", async (req, res) => {
  try {
    const menuItems = await menuCollection.find({}).toArray();
    res.send(menuItems);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/admin/update-menu/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    if (updateData.status === "Rejected") {
      const updateDoc = {
        $set: {
          status: updateData.status,
          isAvailable: false,
        },
      };
      const result = await menuCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc,
      );
      res.send(result);
    } else {
      const updateDoc = {
        $set: {
          status: updateData.status,
          isAvailable: true,
        },
      };
      const result = await menuCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc,
      );
      res.send(result);
    }
  } catch (error) {
    console.error("Error updating menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/admin/delete-menu/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error("Error deleting menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// admin routes

//Public home routes

//get six menu items
app.get("/home/get-six-menu", async (req, res) => {
  try {
    const menuItems = await menuCollection.find({}).toArray();
    res.status(200).send(menuItems);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/home/get-menu-details/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const menuDetails = await menuCollection.findOne({ _id: new ObjectId(id) });
    res.status(200).send(menuDetails);
  } catch (error) {
    console.error("Error fetching menu details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
// Public home routes

//Browse routes
app.get("/browse/get-all-menu", async (req, res) => {
  try {
    const query = {};
    if (req.query) {
      if (req.query.category) {
        query.category = req.query.category;
        const menuItems = await menuCollection.find(query).toArray();
        const filtered = menuItems.filter(
          (item) => item.status === "Approved" && item.isAvailable === true,
        );
        res.status(200).send(filtered);
        return;
      }else if(req.query.location){
        query.location = req.query.location;
         const menuItems = await menuCollection.find(query).toArray();
        const filtered = menuItems.filter(
          (item) => item.status === "Approved" && item.isAvailable === true,
        );
        res.status(200).send(filtered);
        return;
      }else if(req.query.search){
        query.$or=[
          {itemName:{$regex:req.query.search, $options: "i"}},
          {description: {$regex:req.query.search, $options: "i"}},
          {price: {$regex:req.query.search, $options: "i"}},
        ]
      }

    }
      const menuItems = await menuCollection.find(query).toArray();
     const filtered = menuItems.filter(
          (item) => item.status === "Approved" && item.isAvailable === true,
        );
        res.status(200).send(filtered);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
//Browse routes
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
