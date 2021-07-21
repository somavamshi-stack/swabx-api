const express = require("express");
const helmet = require("helmet");
const logger = require("morgan");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const redis = require("redis");
const marked = require("marked");
const cors = require("cors");
const fs = require("fs");
const tls = require("tls");
const path = require("path");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const http = require("http");
const https = require("https");
const RedisMan = require("./utils/redis_man");
const nocache = require("nocache");
require("dotenv").config();
require("./_helpers/db");
const connectRedis = require("connect-redis");
const session = require("express-session");
const RedisStore = connectRedis(session);
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 6000 // limit each IP to 6000 requests per windowMs
});

const redisConfig = {
  host: process.env.REDIS_HOST || "10.2.0.4",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "HealthX!Chain123BLR"
};
RedisMan.init({
  config: redisConfig
});
var client = redis.createClient(redisConfig);

const app = express();

app.use(
  session({
    store: new RedisStore({ ...redisConfig, client: client }),
    name: "session",
    secret: process.env.SECRET,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // week in seconds
    },
    resave: true,
    saveUninitialized: true,
    rolling: true
  })
);

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
app.use(compression({ threshold: 0, level: 9, memLevel: 9 }));
app.use(helmet({ frameguard: { action: "deny" } }));
app.use(nocache());

app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());
app.use(helmet.hidePoweredBy());
app.use(logger("dev"));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// allow cors requests from any origin and with credentials
const allowlist = ["https://swabx.healthx.global"];
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

app.use("/api/v1", require("./controllers"));

// global error handler

app.use((req, res) => {
  res.status(404).json({ message: "Resource Not Found." });
});

app.use((err, req, res, next) => {
  //error response for validation error
  if (typeof err === "string" && err.startsWith("Invalid input")) {
    return res.status(400).send({ message: err });
  }

  return res.status(err.status || 500).json({ message: err.message || "Internal Server Error." });
});

// start server
tls.CLIENT_RENEG_LIMIT = 0;
var server;
if (process.env.NODE_ENV === "production") {
  const privateKey = fs.readFileSync(path.join(__dirname, "privkey.pem"), "utf8");
  const certificate = fs.readFileSync(path.join(__dirname, "fullchain.pem"), "utf8");
  server = https.createServer({ key: privateKey, cert: certificate }, app);
  port = process.env.PORT || 443;
} else {
  server = http.createServer(app);
  port = process.env.PORT || 80;
}
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
