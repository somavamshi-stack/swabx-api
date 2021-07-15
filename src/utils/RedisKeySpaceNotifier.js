const EventEmitter = require("events").EventEmitter;
const subscriptionKey = "__key*__:system:settings:*";
const RedisStore = require("ioredis");

let alert = false;

class RedisKeySpaceNotifier extends EventEmitter {
  constructor() {
    super();
  }

  register(opts) {
    this.subscriber = new RedisStore(opts);

    this.subscriber.setMaxListeners(100);

    this.subscriber.on(
      "ready",
      function () {
        console.warn("Subscribing to Redis keyspace:", subscriptionKey);
        this.subscriber.select(opts.db || 0);
        this.subscriber.psubscribe(subscriptionKey);
      }.bind(this)
    );

    //Bind To Redis Store Message Handler
    this.subscriber.on(
      "pmessage",
      function (pattern, channel, key) {
        if (!alert) {
          alert = true;
          setTimeout(() => {
            this.emit("reload_config", pattern, channel, key);
            alert = false;
          }, 10000);
        }
      }.bind(this)
    );
  }
  unregister() {
    this.subscriber.punsubscribe(subscriptionKey);
  }
  close() {
    this.subscriber.close();
  }
}

module.exports = RedisKeySpaceNotifier;
