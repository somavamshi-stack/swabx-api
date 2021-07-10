const db = require("../_helpers/db");
const request = require("request");
const Role = require("../_helpers/role");
const logger = require("../utils/logger");

const appointment = require("./appointment.request");

const BC_URL = process.env.BC_URL || "http://10.2.0.4:8080/api/v1";
const MONGO_URL = process.env.MONGO_URL || "mongodb://10.2.1.6:27017";
const AppID = "SwabX";
const BC_HEADERS = {
  "User-Agent": AppID,
  API_KEY: "HealthX",
  AppID: AppID
};
const BC_PATHS = {
  REGISTER: "/breathalyzer/registration",
  UPLOAD: "/client/app",
  REPORT: "/breathalyzer/fetchResults/passenger"
};

const { MongoClient } = require("mongodb");
const { Op } = require("sequelize");
const http = require("http");
const keepAliveAgent = new http.Agent({
  maxSockets: 40,
  keepAlive: true,
  maxFreeSockets: 20
});

var client;
async function getConnection() {
  if (client == null) {
    client = new MongoClient(MONGO_URL, {
      useUnifiedTopology: true
    });
  }
  let conn = await client.connect();
  return await conn.db(process.env.MONGO_DATABASE || "HealthX_1");
}

function sendRequest(path, payload) {
  return new Promise((resolve) => {
    const options = {
      url: BC_URL + path,
      method: "POST",
      json: payload,
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": JSON.stringify(payload).length,
        Accept: "application/json",
        "Accept-Charset": "utf-8",
        ...BC_HEADERS
      },
      agent: keepAliveAgent,
      time: true
    };
    request(options, function (err, resp, body) {
      if (err != null) {
        logger.error("Exception", err);
        return resolve({
          statusCode: 500,
          body: {
            message: "External Service is down please try after sometime."
          }
        });
      }
      resolve({ statusCode: resp.statusCode, body });
    });
  });
}

const register = async (req, res) => {
  try {
    req.body.staffId = req.user.id;
    const account = await db.Account.findOne({
      where: {
        id: req.user.id
      }
    });
    req.body.customerId = account.customerId;
    try {
      await appointment("/schedules/update_status", "POST", null, {
        id: req.body.patientId,
        status: "Finished"
      });
    } catch (error) {}
    const response = await sendRequest(BC_PATHS.REGISTER, req.body);
    res.status(response.statusCode).json(response.body);

    if (response.statusCode == 201 || response.statusCode == 200) {
      try {
        const barcode = new db.Barcode({
          code: req.body.barcode,
          batchId: req.body.staffId,
          status: 1,
          accountId: req.body.customerId,
          staffId: req.body.staffId,
          locationId: req.body.locationId,
          patientId: req.body.patientId
        });
        barcode.save();
      } catch (e) {
        logger.error("External", e);
      }
    }
  } catch (error) {
    logger.error("Exception while registering patient", error);
    res.status(500).json({ error: "Critical error occured, Please Contact Admin" });
  }
};

const upload = async (req, res) => {
  var response;
  try {
    response = await sendRequest(BC_PATHS.UPLOAD, req.body);
    res.status(response.statusCode).send(response.body);
  } catch (error) {
    res.status(500).json({ error: "Critical error occured, Please Contact Admin" });
  }
  try {
    if (response && response.statusCode == 201) {
      db.Barcode.update(
        {
          diagnosis: req.body.diagnosis,
          reportTime: req.body.date + " " + req.body.time
        },
        {
          where: {
            code: req.body.subject_id
          }
        }
      );
    }
  } catch (error) {
    logger.error("Error updating table", error);
  }
};

const resultPatient = async (req, res) => {
  try {
    const response = await sendRequest(BC_PATHS.REPORT, {
      ...req.body,
      limit: 10,
      skip: 0
    });
    if (response.statusCode == 404) {
      return res.status(404).send({
        _msg: "No records found",
        _status: 404
      });
    } else {
      let results = [];
      response.statusCode === 200 &&
        response.body._data.forEach((item) => {
          results.push(item.data);
        });
      res.status(response.statusCode).send({
        _msg: "success",
        _status: response.statusCode,
        results
      });
    }
  } catch (error) {
    logger.error("Exception while fetching user report", error);
    res.status(500).json({ error: "Critical error occured, Please Contact Admin" });
  }
};
const getCustomerCount = async (req, res) => {
  const totalCustomers = await db.Account.count({
    where: { role: Role.Customer }
  });
  res.send({ totalCustomers });
};

const scrap = async (req, res) => {
  const status = await db.Barcode.update(
    { status: 2, staffId: req.user.id },
    {
      where: {
        [Op.and]: {
          code: req.body.barcode,
          status: { [Op.ne]: 2 }
        }
      }
    }
  );
  res.send({ status: status[0] == 1 });
};
const getLocationCount = async (req, res) => {
  const location = await db.Location.count();
  res.send({ location });
};

const getTestStats = async (req, res) => {
  try {
    logger.info(`Query string params: ${JSON.stringify(req.query)}`);
    const start = req.query.startDate + "T00:00:00";
    const end = req.query.endDate + "T23:59:59";
    logger.info(`Executing test getTestStats mongo call with Start:${start}, End:${end}`);
    const mdb = await getConnection();
    const patients = await mdb.collection(AppID + "_Registration").count();
    const totalInvaidResults = await mdb
      .collection(AppID + "_stats")
      .aggregate([{ $match: { updatedAt: { $gte: start, $lte: end } } }, { $group: { _id: "$diagnosis", count: { $sum: 1 } } }])
      .toArray();

    let negative = 0,
      positive = 0,
      invalid = 0,
      totalHits = 0,
      pending = 0;
    totalInvaidResults.forEach((item) => {
      totalHits += item.count;
      switch (item._id) {
        case "Negative":
          negative += item.count;
          break;
        case "Positive":
          positive += item.count;
          break;
        case "Invalid":
          invalid += item.count;
          break;
        default:
          pending += item.count;
      }
    });
    res.send({
      startDate: start,
      endDate: end,
      patients,
      results: {
        totalHits,
        invalid,
        positive,
        negative,
        pending
      }
    });
  } catch (e) {
    logger.error("Exception in fetching stats", e);
    res.status("500").send({ message: "Failed to retrieve data" });
  }
};

const getAvgStats = async (req, res) => {
  try {
    logger.info(`Query string params: ${JSON.stringify(req.query)}`);
    const start = req.query.startDate + " 00:00:00";
    const end = req.query.endDate + " 23:59:59";
    logger.info(`Executing getAvgStats mongo call with Start:${start}, End:${end}`);

    const custMap = {};
    if (req.query.type == "customerId") {
      const custList = await db.Account.findAll({
        where: {
          role: Role.Customer
        }
      });
      custList.forEach((cust) => {
        custMap[cust.id] = cust.name;
      });
    }

    const mdb = await getConnection();
    let stats = await mdb
      .collection(AppID + "_stats")
      .aggregate([
        {
          $match: {
            updatedAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              cat: req.query.type == "location" ? "$location" : "$customerId"
            },
            average: { $avg: "$diff" },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    stats = stats.sort(function (a, b) {
      return b.count - a.count;
    });

    let response = {
      data: [],
      average: [],
      count: []
    };

    stats.forEach(async (item) => {
      if (req.query.type == "customerId") {
        response.data.push(custMap[item._id.cat] || item._id.cat);
      } else {
        response.data.push(item._id.cat);
      }

      response.average.push(item.average);
      response.count.push(item.count);
    });
    res.send(response);
  } catch (e) {
    logger.error("Exception in fetching avg stats", e);
    res.status("500").send({ message: "Failed to retrieve data" });
  }
};

const patientList = async (req, res) => {
  const location = await db.Barcode.findAll({
    order: [["createdAt", "DESC"]],
    attributes: ["code", "patientId", "diagnosis"],
    where: {
      locationId: req.query.locationId,
      checkoutTime: null
    }
  });
  res.send(location);
};

const checkout = async (req, res) => {
  const location = await db.Barcode.update(
    {
      checkoutTime: new Date()
    },
    {
      where: {
        patientId: req.body.patientId,
        code: req.body.barcode
      }
    }
  );
  res.send(location);
};

module.exports = {
  register,
  resultPatient,
  upload,
  getCustomerCount,
  getLocationCount,
  getTestStats,
  getAvgStats,
  scrap,
  patientList,
  checkout
};
