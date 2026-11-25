import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { MongoClient, ObjectId } from "mongodb";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ---------- MongoDB (serverless-safe) ----------
// Client একবারই বানানো হবে এবং globalThis-এ জমা থাকবে,
// তাই Vercel-এর একই instance-এ বারবার নতুন connection খুলবে না।
const uri = process.env.MONGO_URL;

let cached = globalThis._mongo;
if (!cached) cached = globalThis._mongo = { promise: null };

async function getDb() {
  if (!cached.promise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    cached.promise = client.connect().catch((err) => {
      cached.promise = null; // fail করলে পরের request-এ আবার চেষ্টা করবে
      throw err;
    });
  }
  const client = await cached.promise;
  return client.db("pizza-hub");
}

// প্রতিটা request-এ collection গুলো req-এর সাথে জুড়ে দেওয়া হয়
app.use(async (req, res, next) => {
  try {
    const db = await getDb();
    req.users = db.collection("user");
    req.menu = db.collection("menu");
    req.orders = db.collection("order");
    req.payments = db.collection("payment");
    req.sessions = db.collection("session");
    next();
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(503).send({ message: "Database unavailable" });
  }
});

// প্রতিটা route-এ try/catch না লিখে এই helper ব্যবহার করা হয়েছে
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
    res.status(500).send({ message: "Internal server error" });
  });

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// ---------- Auth middlewares ----------
const verifyToken = wrap(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const session = await req.sessions.findOne({ token });
  if (!session) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const user = await req.users.findOne({ _id: new ObjectId(session.userId) });
  if (!user) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  req.user = user;
  next();
});

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

const verifyVendor = (req, res, next) => {
  if (req.user.role !== "vendor") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

const verifyCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

const verifyUserWithVendorOrCustomer = (req, res, next) => {
  if (req.user.role !== "vendor" && req.user.role !== "customer") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
}

// ---------- Vendor routes ----------

// get vendor's menu
app.get(
  "/vendor/:id/my-menu",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    if (id !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.menu.find({ vendorId: id }).toArray();
    res.send(result);
  }),
);

// get vendor menu details
app.get(
  "/vendor/menu-details/:id",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const result = await req.menu.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    if (result.vendorId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    res.send(result);
  }),
);

// get menu count
app.get(
  "/vendor/menu-count",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const vendorId = req.query.vendorId;
    if (!vendorId || vendorId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const count = await req.menu.countDocuments({ vendorId });
    res.status(200).send({ count });
  }),
);

// add menu
app.post(
  "/vendor/add-menu",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const menuData = req.body;
    if (req.user._id.toString() !== menuData.vendorId) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.menu.insertOne(menuData);
    res.status(201).send(result);
  }),
);

// update menu
app.patch(
  "/vendor/update-menu/:id",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    const menuItem = await req.menu.findOne({ _id: new ObjectId(id) });
    if (!menuItem) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    if (menuItem.vendorId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.menu.updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body },
    );
    res.send(result);
  }),
);

// delete menu
app.delete(
  "/vendor/delete-menu/:id",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    const menuItem = await req.menu.findOne({ _id: new ObjectId(id) });
    if (!menuItem) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    if (menuItem.vendorId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.menu.deleteOne({ _id: new ObjectId(id) });
    await req.orders.deleteMany({ itemId: id });
    res.send(result);
  }),
);

// get orders (vendor)
app.get(
  "/vendor/get-orders/:email",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const email = req.params.email;
    if (email !== req.user.email) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const orders = await req.orders.find({ vendorEmail: email }).toArray();
    res.status(200).send(orders);
  }),
);

// update order status
app.patch(
  "/vendor/order-status-update/:id",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    const order = await req.orders.findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }
    if (order.vendorId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.orders.updateOne(
      { _id: new ObjectId(id) },
      { $set: { orderStatus: req.body.orderStatus } },
    );
    res.status(200).send(result);
  }),
);

// vendor premium status
app.get(
  "/vendor/:id/premium",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const vendor = await req.users.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { premium: 1 } },
    );
    res.send(vendor);
  }),
);

app.patch(
  "/vendor/:id/profile",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    const updateData = req.body;
    const updateDoc = {
      $set: { name: updateData.name, image: updateData.image },
    };
    const result = await req.users.updateOne(
      { _id: new ObjectId(id) },
      updateDoc,
    );
    res.send(result);
  }),
);

app.get(
  "/vendor/:id/profile",
  verifyToken,
  verifyVendor,
  wrap(async (req, res) => {
    const id = req.params.id;
    const vendor = await req.users.findOne(
      { _id: new ObjectId(id) },
      { projection: { image: 1, name: 1 } },
    );
    res.send(vendor);
  }),
);

// ---------- Admin routes ----------

app.get(
  "/admin/get-all-users",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const users = await req.users.find({}).toArray();
    res.send(users);
  }),
);

app.get(
  "/admin/get-user-details/:id",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const user = await req.users.findOne({ _id: new ObjectId(req.params.id) });
    res.send(user);
  }),
);

app.get(
  "/admin/get-all-menu",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const menuItems = await req.menu.find({}).toArray();
    res.send(menuItems);
  }),
);

app.patch(
  "/admin/update-menu/:id",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    // Rejected হলে item unavailable, নাহলে available
    const result = await req.menu.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, isAvailable: status !== "Rejected" } },
    );
    res.send(result);
  }),
);

app.delete(
  "/admin/delete-menu/:id",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const id = req.params.id;
    const result = await req.menu.deleteOne({ _id: new ObjectId(id) });
    await req.orders.deleteMany({ itemId: id });
    res.send(result);
  }),
);

app.get(
  "/admin/get-all-payments",
  verifyToken,
  verifyAdmin,
  wrap(async (req, res) => {
    const payments = await req.payments.find({}).toArray();
    res.send(payments);
  }),
);

// ---------- Public home routes ----------

app.get(
  "/home/get-six-menu",
  wrap(async (req, res) => {
    const menuItems = await req.menu.find({}).toArray();
    res.status(200).send(menuItems);
  }),
);

app.get(
  "/home/get-menu-details/:id",
  wrap(async (req, res) => {
    const menuDetails = await req.menu.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.status(200).send(menuDetails);
  }),
);

// ---------- Browse routes ----------

app.get(
  "/browse/get-all-menu",
  wrap(async (req, res) => {
    const query = {};
    if (req.query.category) {
      query.category = req.query.category;
    } else if (req.query.location) {
      query.location = { $regex: req.query.location, $options: "i" };
    } else if (req.query.search) {
      query.$or = [
        { itemName: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
      ];
    }
    const menuItems = await req.menu.find(query).toArray();
    const filtered = menuItems.filter(
      (item) => item.status === "Approved" && item.isAvailable === true,
    );
    res.status(200).send(filtered);
  }),
);

// ---------- Customer routes ----------

// add order
app.post(
  "/customer/add-order",
  verifyToken,
  verifyCustomer,
  wrap(async (req, res) => {
    const orderData = req.body;
    if (orderData.customerId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Unauthorized access" });
    }
    const result = await req.orders.insertOne(orderData);
    res.status(201).send(result);
  }),
);

// get orders by customer id
app.get(
  "/customer/get-orders/:id",
  verifyToken,
  verifyCustomer,
  wrap(async (req, res) => {
    const id = req.params.id;
    if (id !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const orders = await req.orders.find({ customerId: id }).toArray();
    res.status(200).send(orders);
  }),
);

// delete order by order id
app.delete(
  "/customer/delete-order/:id",
  verifyToken,
  verifyCustomer,
  wrap(async (req, res) => {
    const id = req.params.id;
    const order = await req.orders.findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }
    if (order.customerId !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const result = await req.orders.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send(result);
  }),
);

app.patch(
  "/customer/:id/profile",
  verifyToken,
  verifyCustomer,
  wrap(async (req, res) => {
    const id = req.params.id;
    const updateData = req.body;
    const updateDoc = {
      $set: { name: updateData.name, image: updateData.image },
    };
    const result = await req.users.updateOne(
      { _id: new ObjectId(id) },
      updateDoc,
    );
    res.send(result);
  }),
);

app.get(
  "/customer/:id/profile",
  verifyToken,
  verifyCustomer,
  wrap(async (req, res) => {
    const id = req.params.id;
    if (id !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    const customer = await req.users.findOne(
      { _id: new ObjectId(id) },
      { projection: { image: 1, name:1 } },
    );
    res.send(customer);
  }),
);





app.get(
  "/customer/:id/customer-vendor",
  verifyToken,
  verifyUserWithVendorOrCustomer,
  wrap(async (req, res) => {
    const id = req.params.id;
    const customer = await req.users.findOne(
      { _id: new ObjectId(id) });
    res.send(customer);
  }),
);
// ---------- Payment routes ----------




app.post(
  "/payments/checkoutVerify",
  wrap(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.send({ success: false, message: "Session ID is required" });
    }

    const { status, payment_status, customer_email, metadata, payment_intent } =
      await stripe.checkout.sessions.retrieve(sessionId);

    if (status === "complete" && payment_status === "paid") {
      const existingPayment = await req.payments.findOne({ sessionId });
      if (existingPayment) {
        return res.send({
          success: false,
          message: "Payment already processed",
        });
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
      const result = await req.payments.insertOne(payment);

      const updatedUser = await req.users.updateOne(
        { _id: new ObjectId(metadata.userId) },
        { $set: { premium: true } },
      );
      return res.send({ success: true, result, updatedUser });
    }

    res.send({ success: false, message: "Payment not successful" });
  }),
);

// শুধু লোকালে listen করবে; Vercel নিজে সেটা সামলায়
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
