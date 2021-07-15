const EventEmitter = require("events");
const redis_man = require("./redis_man");
const WB = "whiteboard";
const WBPUBLISH = "WBPUBLISH";
const WBSUBSCRIBE = "WBSUBSCRIBE";

class Whiteboard extends EventEmitter {
  async init(opts) {
    redis_man.init({
      key: WBSUBSCRIBE,
      config: opts,
      oid: WB
    });

    redis_man.init({
      key: WBPUBLISH,
      config: opts,
      oid: WB
    });
    this.opts = opts;
    let connection = await redis_man.getConnection(WBSUBSCRIBE);
    connection.on("message", (channel, data) => {
      console.error("WB: Channel:", channel, ", message:", data);
      if (typeof data == "string") {
        try {
          data = JSON.parse(data);
        } catch (error) {
          data = { code: channel, message: data };
        }
      }
      this.emit(data.code, data.message);
    });
    connection = await redis_man.getConnection(WBPUBLISH);
  }

  async publish(event, message) {
    let data = { code: event, message: message };
    let connection = await redis_man.getConnection(WBPUBLISH);
    connection.publish(event, JSON.stringify(data));
    console.log("WB: Published message to an event:%s, data", event, JSON.stringify(data));
  }

  async subscribe(event) {
    try {
      let connection = await redis_man.getConnection(WBSUBSCRIBE);
      connection.subscribe(event, () => {
        console.log("WB: Subscribed to an event:%s", event);
      });
    } catch (e) {
      console.error("Failed to subscriber to an Event:", event, e);
    }
  }
}

module.exports = new Whiteboard();
