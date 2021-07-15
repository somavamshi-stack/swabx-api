"use strict";
const RedisStore = require("ioredis");
let redisPool = {};

//const OAM = require("oam");
const DEFAULT_KEY = "default";
module.exports = {
  init: (props) => {
    if (!props) {
      props = {
        key: DEFAULT_KEY,
        config: {
          host: "127.0.0.1",
          port: 6379,
          db: 0
        },
        oid: "Unknown"
      };
    }
    if (!props.key) {
      props.key = DEFAULT_KEY;
    }
    redisPool[props.key] = {
      config: props.config,
      oid: props.oid || "redis",
      redis: null, // initial value, when no connection is yet attempted.
      status: 0 // status of connection.
    };
    console.warn("Register redisprop(" + props.key + ") ");
  },

  getConnection: (key) => {
    if (!key) {
      key = DEFAULT_KEY;
    }
    return new Promise((resolve, reject) => {
      const conn = redisPool[key];
      if (conn && conn.redis != null && conn.status == 1) {
        resolve(conn.redis);
      } else {
        conn.redis = new RedisStore(conn.config);

        conn.redis.setMaxListeners(100);

        conn.redis.on("ready", () => {
          conn.status = 1;
          //OAM.emit("clearAlert", conn.oid);
          return resolve(conn.redis);
        });

        conn.redis.on("error", (e) => {
          conn.redis = null;
          conn.status = 0;
          e.config = conn.config;
          //OAM.emit("criticalAlert", conn.oid);
          return reject(e);
        });
      }
    });
  },

  health: () => {
    let report = {};
    Object.keys(redisPool).forEach((key) => {
      report[key] = redisPool[key].status == 1 ? "OK" : "KO";
    });
    return report;
  }
};
