import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());


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
const orderCollection = db.collection("order");
const paymentCollection = db.collection("payment");
const sessionCollection = db.collection("session");

app.get("/", (req, res) => {
  res.send("Hello, World!");
});


const verifyToken = async(req, res, next) => {
  const authHeader = req.headers.authorization;
  if(!authHeader){
    res.status(401).send({message: "Unauthorized access"});
    return 
  }
  console.log("Authorization header:", authHeader);
  const token = authHeader.split(" ")[1];
  if(!token){
     res.status(401).send({message: "Unauthorized access"});
     return;
  }
  console.log("Token:", token);
  const query = {token};
  const session = await sessionCollection.findOne(query);
  if(!session){
    res.status(401).send({message: "Unauthorized access"});
    return;
  }
  console.log("Session found:", session);
  const user = await usersCollection.findOne({_id: new ObjectId(session.userId)});
  console.log("User found:", user);
  req.user = user;
  next();
}


const verifyAdmin = (req,res,next)=>{
  if(req.user.role !== "admin"){
    res.status(403).send({message: "Forbidden access"});
    return;
  }
  next();
}

const verifyVendor = (req,res,next)=>{
  if(req.user.role !== "vendor"){
    res.status(403).send({message: "Forbidden access"});
    return;
  }
  next();
}

const verifyCustomer = (req,res,next)=>{
  if(req.user.role !== "customer"){
    res.status(403).send({message: "Forbidden access"});
    return;
  }
  next();
}

// vendor routes
//get menu
app.get("/vendor/:id/my-menu", verifyToken, verifyVendor ,async (req, res) => {
  try {
    const id = req.params.id;
    if(id === req.user._id.toString()){
      const result = await menuCollection.find({ vendorId: id }).toArray();
      res.send(result);
      return;
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching menu:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//get vendor menu details
app.get("/vendor/menu-details/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.findOne({ _id: new ObjectId(id) });
    if(result.vendorId === req.user._id.toString()){
      res.send(result);
      return;
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching menu details:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// get crate menut count
app.get("/vendor/menu-count", verifyToken, verifyVendor ,async (req, res) => {
  try {
    const query = {};
    if (req.query.vendorId && req.query.vendorId === req.user._id.toString()) {
      query.vendorId = req.query.vendorId;
      const result = await menuCollection.countDocuments(query);
      res.status(200).send({ count: result });
    }
  } catch (error) {
    console.error("Error fetching menu count:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
//add menu
app.post("/vendor/add-menu",verifyToken, verifyVendor,async (req, res) => {
  try {
    const menuData = req.body;
    if(req.user._id.toString() === menuData.vendorId){
      const result = await menuCollection.insertOne(menuData);
      res.status(201).send(result);
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error adding menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//update menu
app.patch("/vendor/update-menu/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const userId = await menuCollection.findOne({_id: new ObjectId(id)})
    if( userId.vendorId === req.user._id.toString()){

      const result = await menuCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );
      res.send(result);
      return;
    }
    res.status(403).send({message: "Forbidden access"});

  } catch (error) {
    console.error("Error updating menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//delete menu
app.delete("/vendor/delete-menu/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = await menuCollection.findOne({_id: new ObjectId(id)})
    if(userId.vendorId === req.user._id.toString()){
      const result = await menuCollection.deleteOne({ _id: new ObjectId(id) });
      await orderCollection.deleteMany({itemId: id});
      res.send(result);
      return;
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error deleting menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// orders
app.get("/vendor/get-orders/:email", verifyToken, verifyVendor, async (req, res) => {
  try {
    const email = req.params.email;
    if(email === req.user.email){
      const orders = await orderCollection.find({ vendorEmail: email }).toArray();
      res.status(200).send(orders);
      return;
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//customer order details for vendor
app.patch("/vendor/order-status-update/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const userID = await orderCollection.findOne({ _id: new ObjectId(id) });
    if(userID.vendorId === req.user._id.toString()){
      const updateDoc = {
        $set: {
          orderStatus: updateData.orderStatus,
        },
      };
      const result = await orderCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc,
      );
      res.status(200).send(result);
    };

    res.status(403).send({message: "Forbidden access"});
    return;
  } catch (error) {
    console.error("Error updating order details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/vendor/:id/premium", verifyToken, verifyVendor,async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id)};
    const vendor = await usersCollection.findOne(query, { projection: { premium: 1 } });
    res.send(vendor);
  } catch (error) {
    console.error("Error fetching user premium status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// vendor routes



// admin routes

//getAllUsers
app.get("/admin/get-all-users", verifyToken, async (req, res) => {
  try {

    if(req.user.role === "admin"){
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// get user Details
app.get("/admin/get-user-details/:id", verifyToken,async (req, res) => {
  try {
    const id = req.params.id;
    if(req.user.role === "admin"){
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      res.send(user);
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/admin/get-all-menu", verifyToken,verifyAdmin,async (req, res) => {
  try {
    const menuItems = await menuCollection.find({}).toArray();
    res.send(menuItems);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/admin/update-menu/:id", verifyToken, verifyAdmin, async (req, res) => {
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

app.delete("/admin/delete-menu/:id",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await menuCollection.deleteOne({ _id: new ObjectId(id) });
    await orderCollection.deleteMany({itemId: id});
    res.send(result);
  } catch (error) {
    console.error("Error deleting menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/admin/get-all-payments", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const payments = await paymentCollection.find({}).toArray();
    res.send(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
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
      } else if (req.query.location) {
        query.location = { $regex: req.query.location, $options: "i" };
        const menuItems = await menuCollection.find(query).toArray();
        const filtered = menuItems.filter(
          (item) => item.status === "Approved" && item.isAvailable === true,
        );
        res.status(200).send(filtered);
        return;
      } else if (req.query.search) {
        query.$or = [
          { itemName: { $regex: req.query.search, $options: "i" } },
          { description: { $regex: req.query.search, $options: "i" } },
        ];
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



//Customer routes

//add order
app.post("/customer/add-order", verifyToken , verifyCustomer ,async (req, res) => {
  try {
    const orderData = req.body;
    if(orderData.customerId === req.user._id.toString()){
      const result = await orderCollection.insertOne(orderData);
      res.status(201).send(result);
      return
    }
    res.status(403).send({message: "Unauthorized access"});
  } catch (error) {
    console.error("Error adding order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//get orders by customer id
app.get("/customer/get-orders/:id",verifyToken, verifyCustomer, async (req, res) => {
  try {
    const id = req.params.id;
    if(id === req.user._id.toString()){
      const orders = await orderCollection.find({ customerId: id }).toArray();
      return res.status(200).send(orders);
    }
    return res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//Delete order by order id
app.delete("/customer/delete-order/:id",verifyToken,verifyCustomer,async (req, res) => {
  try {
    const id = req.params.id;
    console.log("Order ID to delete:", id);
    const customer = await orderCollection.findOne({_id:new ObjectId(id)});
    if(customer.customerId === req.user._id.toString()){
      const result = await orderCollection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).send(result);
      return;
    }
    res.status(403).send({message: "Forbidden access"});
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



//Customer routes

// payment routes

app.post("/payments/checkoutVerify", async (req, res) => {
  const { sessionId } = req.body;
  if(!sessionId){
    return res.send({ success: false, message: "Session ID is required" });
  }
  const { status, payment_status, customer_email, metadata, payment_intent } =
    await stripe.checkout.sessions.retrieve(sessionId);

    console.log("Payment status:", sessionId);

  if (status === "complete" && payment_status === "paid") {

    const sessionQuery = { sessionId };

    const existingPayment = await paymentCollection.findOne(sessionQuery);

    if(existingPayment){
      return res.send({ success: false, message: "Payment already processed" });
    }

    const payment = {
      status,
      payment_status,
      customer_email,
      userId: metadata.userId,
      payment_date: new Date(),
      payment_intent,
      sessionId,
    };
    console.log("Payment successful:", metadata.userId);
    const result = await paymentCollection.insertOne(payment);
    const query = { _id: new ObjectId(metadata.userId) };
    const updateDoc = {
      $set:{
        premium: true
      }
    }

    const updatedUser = await usersCollection.updateOne(
      query,
      updateDoc
    )
    res.send({success: true,result, updatedUser});
    return;
  }

  res.send({ success: false, message: "Payment not successful" });
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
