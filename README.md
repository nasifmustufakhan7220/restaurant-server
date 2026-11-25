# Pizza Ordering Server

Backend REST API for a pizza ordering marketplace. It supports three roles — **admin**, **vendor**, and **customer** — and handles menu management, order placement/cancellation, admin moderation, user profiles, and Stripe-based premium upgrades. Built with Express 5 and MongoDB, and deployable to Vercel as a serverless function.

## Features

- Express 5 REST API with role-based access control (admin / vendor / customer)
- MongoDB (database `pizza-hub`) with collections: `user`, `menu`, `order`, `payment`, `session`
- Vendor menu CRUD with ownership checks
- Admin moderation of menus, users, and payments
- Customer order creation, listing, and cancellation
- Public menu browsing with category, location, and text search filters
- Stripe Checkout session verification with idempotent payment recording
- Premium vendor upgrade flow
- Serverless-safe MongoDB connection caching (Vercel friendly)
- Global error handling via `wrap` helper
- CORS enabled for frontend integration

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Framework:** Express 5
- **Database:** MongoDB (native driver 7)
- **Payments:** Stripe
- **Validation (available):** Zod
- **Config:** dotenv
- **Deployment:** Vercel (`@vercel/node`)

## Project Structure

```
pizza-odering-server/
├── index.js          # Application entry point and all routes
├── package.json
├── vercel.json       # Vercel build/route configuration
├── .env              # Environment variables (not committed)
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 18+ (tested on Node 24)
- npm
- A MongoDB database (MongoDB Atlas recommended)
- A Stripe account (test or live secret key)

## Installation

```bash
git clone <repository-url>
cd pizza-odering-server
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>/...
STRIPE_SECRET_KEY=sk_test_...
PORT=5000
```

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URL` | Yes | MongoDB connection string. Database used is `pizza-hub`. |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key used for checkout verification. |
| `PORT` | No | Server port for local development (default `5000`). |

> Never commit `.env` to version control. If credentials were ever committed, rotate them immediately.

## Running Locally

```bash
npm start
```

For auto-reload during development:

```bash
npm run dev
```

The server listens on `http://localhost:5000` when `NODE_ENV` is not `production`.

## Authentication

This API uses server-side session tokens. Clients must send a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

The token is looked up in the `session` collection and must reference an existing user. The user's `role` (`admin`, `vendor`, or `customer`) determines access. User onboarding / login endpoints are not part of this service — sessions are expected to be created by an external auth flow or seeding.

## API Reference

Base URL: `http://localhost:5000` (or your deployed URL).

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | None | Health check; returns `Hello, World!`. |

### Public / Home

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/home/get-six-menu` | None | Returns all menu items. |
| GET | `/home/get-menu-details/:id` | None | Returns a single menu item by id. |

### Browse

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/browse/get-all-menu` | None | Returns approved & available items. Supports one of: `?category=`, `?location=`, `?search=`. |

### Vendor (role: `vendor`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/vendor/:id/my-menu` | Vendor | List menus owned by vendor (`:id` must match user id). |
| GET | `/vendor/menu-details/:id` | Vendor | Get a menu item (ownership checked). |
| GET | `/vendor/menu-count?vendorId=` | Vendor | Count of menus for a vendor. |
| POST | `/vendor/add-menu` | Vendor | Create a menu item. Body must include `vendorId` matching the user. |
| PATCH | `/vendor/update-menu/:id` | Vendor | Update a menu item (ownership checked). |
| DELETE | `/vendor/delete-menu/:id` | Vendor | Delete a menu item and its related orders. |
| GET | `/vendor/get-orders/:email` | Vendor | List orders for a vendor (email must match). |
| PATCH | `/vendor/order-status-update/:id` | Vendor | Update `orderStatus`. Body: `{ "orderStatus": "..." }`. |
| GET | `/vendor/:id/premium` | Vendor | Get vendor premium status. |
| PATCH | `/vendor/:id/profile` | Vendor | Update profile. Body: `{ "name", "image" }`. |
| GET | `/vendor/:id/profile` | Vendor | Get vendor profile image. |

### Admin (role: `admin`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/admin/get-all-users` | Admin | List all users. |
| GET | `/admin/get-user-details/:id` | Admin | Get a user by id. |
| GET | `/admin/get-all-menu` | Admin | List all menu items. |
| PATCH | `/admin/update-menu/:id` | Admin | Set menu `status` and availability. Body: `{ "status": "Approved" \| "Rejected" }`. |
| DELETE | `/admin/delete-menu/:id` | Admin | Delete a menu item and its related orders. |
| GET | `/admin/get-all-payments` | Admin | List all payments. |

### Customer (role: `customer`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/customer/add-order` | Customer | Create an order. Body must include `customerId` matching the user. |
| GET | `/customer/get-orders/:id` | Customer | List orders for a customer. |
| DELETE | `/customer/delete-order/:id` | Customer | Cancel an order. |
| PATCH | `/customer/:id/profile` | Customer | Update profile. Body: `{ "name", "image" }`. |
| GET | `/customer/:id/profile` | Customer | Get customer profile image. |
| GET | `/customer/:id/customer-vendor` | Vendor/Customer | Get a user by id. |

### Payments

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/payments/checkoutVerify` | None | Verify a Stripe Checkout session. Body: `{ "sessionId": "..." }`. Records payment and upgrades the user to premium. |

## Database

MongoDB database name: `pizza-hub`.

| Collection | Purpose |
| --- | --- |
| `user` | Users with roles (`admin`, `vendor`, `customer`) and optional `premium`, `name`, `image`, `email`. |
| `menu` | Menu items with `vendorId`, `status` (`Approved`/`Rejected`), `isAvailable`, etc. |
| `order` | Orders linking `customerId`, `vendorId`/`vendorEmail`, `itemId`, `orderStatus`. |
| `payment` | Recorded Stripe payments. |
| `session` | Auth sessions mapping `token` → `userId`. |

## Deployment (Vercel)

`vercel.json` builds `index.js` with `@vercel/node` and routes all paths to it. The app exports `app` as the default export and only calls `app.listen` outside production.

1. Install the Vercel CLI or connect the repo in the Vercel dashboard.
2. Set environment variables `MONGO_URL` and `STRIPE_SECRET_KEY` in the project settings.
3. Deploy.

The MongoDB client is cached on `globalThis` to avoid opening a new connection on every serverless invocation.

## Known Limitations / Notes

- No user registration or login endpoints are implemented; sessions must be created externally.
- `zod` is a dependency but validation is not currently applied to request bodies.
- Several list endpoints return all documents without pagination.
- `/home/get-six-menu` returns all menu items (name notwithstanding).
- Browse filters are mutually exclusive (`category` → `location` → `search`).
- CORS is open to all origins (`app.use(cors())`).
- Deleting a menu cascades to orders matched by `itemId` as a string; ensure consistency of id formats.

## License

ISC
