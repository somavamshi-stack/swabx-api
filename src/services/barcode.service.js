const db = require("../_helpers/db");
const Role = require("../_helpers/role");

const readXlsxFile = require("read-excel-file/node");
const excel = require("exceljs");
const Pagination = require("../utils/pagination");
const { QueryTypes } = require("sequelize");

const Op = require("sequelize").Op;

const upload = async (req, res) => {
  try {
    if (req.file == undefined) {
      return res.status(400).send({ message: "Please upload a excel file!" });
    }

    let path = __dirname + "/../_middleware/uploads/" + req.file.filename;

    readXlsxFile(path).then(async (rows) => {
      // skip header
      rows.shift();

      if (rows.length > 10000) {
        return res.status(400).send({
          message: "Exceeding maximum file upload limit. Max Limit: 10000 barcodes per file upload."
        });
      }
      let barcodes = [],
        invalid = [],
        duplicates = [],
        valid = [];

      rows.forEach((row) => {
        let barcode = {
          code: row[0],
          batchId: req.batchId,
          accountId: req.user.id
        };
        if (barcode && barcode.code != null && /^[a-zA-Z0-9-]{8,20}$/.test(String(barcode.code))) {
          barcodes.push(barcode);
        } else {
          invalid.push(barcode.code);
        }
      });

      if (barcodes.length == 0) {
        return res.status(400).send({
          totalUploaded: rows.length,
          totalInvalid: invalid.length,
          invalidBarcodes: invalid,
          message: "No barcodes found in file uploaded"
        });
      }

      for (let i = 0; i < barcodes.length; i++) {
        let result = await db.Barcode.findOne({
          where: { code: barcodes[i].code }
        });
        if (result != null) {
          duplicates.push(barcodes[i].code);
        } else {
          valid.push(barcodes[i]);
        }
      }

      if (valid.length == 0) {
        return res.status(400).send({
          totalUploaded: rows.length,
          totalValid: valid.length,
          totalDuplicates: duplicates.length,
          totalInvalid: invalid.length,
          duplicateBarcodes: duplicates,
          invalidBarcodes: invalid,
          message: `No valid barcodes found in ${req.file.originalname} file uploaded. Total Duplicate Barcodes: ${duplicates.length}, Total Invalid Barcodes: ${invalid.length}`
        });
      }
      db.Barcode.bulkCreate(barcodes, {
        returning: ["code"],
        ignoreDuplicates: true
      })
        .then((data) => {
          res.status(200).send({
            totalUploaded: rows.length,
            totalValid: data.length,
            totalDuplicates: duplicates.length,
            totalInvalid: invalid.length,
            duplicateBarcodes: duplicates,
            invalidBarcodes: invalid,
            message: "File processed successfully: " + req.file.originalname
          });
        })
        .catch((error) => {
          res.status(500).send({
            message: "Fail to import data into database!",
            error: error.message
          });
        });
    });
  } catch (e) {
    logger.error("Exception while uploading barcodes", e);
    res.status(500).send({
      message: "Could not upload the file: " + req.file.originalname
    });
  }
};

const STATUS = ["Unassigned", "Assigned", "Scrapped"];
const download = (req, res) => {
  db.Barcode.findAll().then((objs) => {
    let barcodes = [];
    objs.forEach((obj) => {
      barcodes.push({
        code: obj.code,
        batchId: obj.batchId,
        status: STATUS[obj.status] || "-",
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt
      });
    });

    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Barcodes");

    worksheet.columns = [
      { header: "Batch No.", key: "batchId", width: 36 },
      { header: "Barcode Code", key: "code", width: 30 },
      { header: "Status", key: "status", width: 10 },
      { header: "Created Time", key: "createdAt", width: 10 },
      { header: "Updated Time", key: "updatedAt", width: 10 }
    ];

    // Add Array Rows
    worksheet.addRows(barcodes);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=" + "barcodes-" + Date.now() + ".xlsx");

    return workbook.xlsx.write(res).then(function () {
      res.status(200).end();
    });
  });
};

// Retrieve all Barcodes from the database.
const findAll = (req, res) => {
  let { page, size, token, status, order, sortBy } = req.query;
  if (token == null) token = "";
  const { limit, offset } = Pagination.getPagination(page, size);
  status = status != null ? status.split(",") : [0, 1, 2];
  let orderW = [];
  if (sortBy != null && order != null) {
    orderW = [[sortBy || "createdAt", order || "DESC"]];
  }

  db.Barcode.findAndCountAll({
    where: { code: { [Op.like]: `%${token}%` }, status: { [Op.in]: status } },
    limit,
    offset,
    order: orderW
  })
    .then((data) => {
      res.send(Pagination.getPagingData(data, page, limit));
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving barcodes."
      });
    });
};

const createCode = async (req, res) => {
  const code = new db.Barcode(req.body);
  await code.save();
  res.send({ message: "Barcode created successfully" });
};

const deleteCode = (req, res, next) => {
  db.Barcode.destroy({ where: { code: req.params.code } })
    .then((data) => {
      if (data == 1) {
        res.send({ message: "Barcode delete successfully" });
      } else {
        res.status(404).send({ message: "Barcode not found" });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Some error occurred while deleteing barcode."
      });
    });
};

const verify = async (req, res) => {
  try {
    const barcode = await db.Barcode.findOne({
      where: { code: req.body.barcode }
    });
    if (!barcode) {
      return res.status(404).send({ message: "Invalid Barcode" });
    }

    if (!barcode && barcode.status == 1) {
      return res.status(404).send({ message: "Barcode already registered" });
    }
    return res.send({ message: "Barcode is available" });
  } catch (e) {
    res.status(500).send({
      message: err.message || "Some error occurred while verifyin barcode."
    });
  }
};

const report = async (req, res) => {
  try {
    if (req.user.role === Role.Customer) {
      req.query.customerId = req.user.id;
    }

    const QS = `SELECT DATE_FORMAT(barcodes.updatedAt, '%Y-%m-%d') AS 'dt', barcodes.status, count(barcodes.code) as 'hits' FROM accounts, barcodes WHERE barcodes.staffId = accounts.id and barcodes.staffId in (select id from accounts where customerId='${req.query.customerId}' and role='Staff') and barcodes.updatedAt>='${req.query.start} 00:00:00' and barcodes.updatedAt<='${req.query.end} 23:59:59' group by name, dt, status`;
    const records = await db.sequelize.query(QS, {
      type: QueryTypes.SELECT
    });
    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Usage Report");

    worksheet.columns = [
      { header: "Date", key: "dt", width: 25 },
      { header: "Status", key: "status", width: 10 },
      { header: "Count", key: "hits", width: 10 }
    ];

    let data = [];
    records.forEach((rec) => {
      let result = "";
      if (rec.status == 0) {
        result = "Unassigned";
      } else if (rec.status == 1) {
        result = "Assigned";
      } else if (rec.status == 2) {
        result = "Scrapped";
      } else {
        result = "Unknown";
      }
      rec.status = result;
      data.push(rec);
    });

    // Add Array Rows
    worksheet.addRows(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=" + "UsageReport-" + Date.now() + ".xlsx");

    return workbook.xlsx.write(res).then(function () {
      res.status(200).end();
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while verifyin barcode."
    });
  }
};

const customerUsageReport = async (req, res) => {
  try {
    let startDateTime = req.query.startDate + " 00:00:00";
    let endDateTime = req.query.endDate + " 23:59:59";
    const QS = `SELECT CASE WHEN status = 1 THEN 'Assigned' WHEN status = 2 THEN 'Scrapped' END AS S, COUNT(*) AS HITS FROM barcodes WHERE updatedAt >='${startDateTime}' AND updatedAt<='${endDateTime}' AND staffId IN (SELECT id FROM accounts WHERE customerId="${req.user.id}") GROUP BY S`;
    const records = await db.sequelize.query(QS, {
      type: QueryTypes.SELECT
    });
    let total = 0,
      used = 0,
      scrapped = 0;

    records.forEach((item) => {
      if (item.S === "Assigned") {
        total += item.HITS;
        used += item.HITS;
      } else if (item.S === "Scrapped") {
        total += item.HITS;
        scrapped += item.HITS;
      }
    });
    res.send({
      total_kits: formatKits(total),
      kits_assigned: formatKits(used),
      kits_scrapped: formatKits(scrapped)
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while verifyin barcode."
    });
  }
};

const staffUsageReport = async (req, res) => {
  try {
    let startDateTime = req.query.startDate + " 00:00:00";
    let endDateTime = req.query.endDate + " 23:59:59";
    const QS = `SELECT CASE WHEN status = 1 THEN 'Assigned' WHEN status = 2 THEN 'Scrapped' END AS S, COUNT(*) AS HITS FROM barcodes WHERE updatedAt >='${startDateTime}' AND updatedAt<='${endDateTime}' AND staffId="${req.user.id}" GROUP BY S`;
    const records = await db.sequelize.query(QS, {
      type: QueryTypes.SELECT
    });
    let total = 0,
      used = 0,
      scrapped = 0;

    records.forEach((item) => {
      if (item.S === "Assigned") {
        total += item.HITS;
        used += item.HITS;
      } else if (item.S === "Scrapped") {
        total += item.HITS;
        scrapped += item.HITS;
      }
    });
    res.send({
      total_kits: formatKits(total),
      kits_assigned: formatKits(used),
      kits_scrapped: formatKits(scrapped)
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while verifyin barcode."
    });
  }
};

module.exports = {
  upload,
  download,
  findAll,
  deleteCode,
  verify,
  createCode,
  report,
  customerUsageReport,
  staffUsageReport
};

const formatKits = (n) => {
  if (n < 1e3) return n;
  if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + "K";
  if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + "M";
  if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + "B";
  if (n >= 1e12) return +(n / 1e12).toFixed(1) + "T";
};
