const express = require("express");
const helmet = require("helmet");
const logger = require("morgan");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const marked = require("marked");
const cors = require("cors");
const errorHandler = require("./_middleware/error-handler");
const tls = require("tls");
const path = require("path");
const rateLimit = require("express-rate-limit");
const http = require("http");

require("dotenv").config();
require("./_helpers/db");
const RedisMan = require("./utils/redis_man");

const redisConfig = {
  host: process.env.REDIS_HOST || "10.2.0.4",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "HealthX!Chain123BLR"
};
RedisMan.init({
  config: redisConfig
});

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 6000 // limit each IP to 6000 requests per windowMs
});

const app = express();
app.use(limiter);
app.set("trust proxy", 1);
app.set("etag", false); // turning off etag
marked.setOptions({
  sanitize: true
});
app.locals.marked = marked;
app.use(
  helmet.hsts({
    maxAge: 0,
    includeSubDomains: true
  })
);
app.use(
  helmet.frameguard({
    action: "sameorigin"
  })
);

app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());
app.use(helmet.hidePoweredBy());
app.use(logger("dev"));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// allow cors requests from any origin and with credentials
const allowlist = ["https://swabx.healthx.global", "http://localhost:3000", "http://127.0.0.1:3000"];
const corsOptionsDelegate = (req, callback) => {
  let corsOptions = {
    origin: false,
    credentials: true,
    exposedHeaders: ["set-cookie"]
  };

  let isDomainAllowed = process.env.NODE_ENV === "production" ? allowlist.indexOf(req.header("Origin")) !== -1 : true;
  if (isDomainAllowed) {
    // Enable CORS for this request
    corsOptions.origin = true;
  }
  callback(null, corsOptions);
};

app.use(cors(corsOptionsDelegate));

app.use("/api/v1/static", express.static(path.join(__dirname, "../", "assets")));

app.use("/api/v1/accounts", require("./controllers/accounts.controller"));

app.use("/api/v1/customer", require("./controllers/customer.controller"));

app.use("/api/v1/barcode", require("./controllers/barcode.controller"));

app.use("/api/v1/bc", require("./controllers/blockchain.controller"));

app.use("/api/v1/appointment", require("./controllers/appointment.controller"));

// global error handler
app.use((req, res) => {
  res.status(404).json({ message: "Resource Not Found." });
});
app.use((err, req, res) => {
  res.status(err.statusCode || 500);
  res.render("error", {
    message: err.message,
    error: app.get("env") === "development" ? err : {}
  });
});

// start server
const port = process.env.PORT || 80;

tls.CLIENT_RENEG_LIMIT = 0;
const server = http.createServer(app);
server.listen(port, () => console.log("Server listening on port " + port));

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("unhandledRejection", reason, p);
});

function shutdown() {
  console.log("Received kill signal. Initiating shutdown...");
  process.exit(1);
}
