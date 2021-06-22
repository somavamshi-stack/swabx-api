const request = require("request");
const logger = require("../utils/logger");
const http = require("http");
const keepAliveAgent = new http.Agent({
  maxSockets: 40,
  keepAlive: true,
  maxFreeSockets: 20
});
const AS_URL = process.env.AS_URL || "http://10.2.0.4:8985/api/v1.0.0";
const AS_HEADERS = {
  "User-Agent": process.env.AS_UA || "HealthX",
  API_KEY: process.env.AS_API_KEY || "HealthX"
};

function sendRequest(path, method, query, payload) {
  return new Promise((resolve) => {
    let qs = "?";
    query && Object.keys(query).forEach((key) => (qs += key + "=" + query[key] + "&"));
    const options = {
      url: AS_URL + path + qs,
      method: method,
      json: payload,
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": JSON.stringify(payload).length,
        Accept: "application/json",
        "Accept-Charset": "utf-8",
        ...AS_HEADERS
      },
      agent: keepAliveAgent,
      time: true
    };
    console.log(options.url);
    request(options, function (err, resp, body) {
      if (err != null) {
        logger.error("Exception", err);
        return resolve({ statusCode: 500, body: { message: "External Service is down please try after sometime." } });
      }
      resolve({ statusCode: resp.statusCode, body });
    });
  });
}

module.exports = sendRequest;
