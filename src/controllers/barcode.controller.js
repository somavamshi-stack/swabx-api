const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validateRequest = require("../_middleware/validate-request");
const validateQueryString = validateRequest.validateQueryString;
const authorize = require("../_middleware/authorize");
const Role = require("../_helpers/role");
const upload = require("../_middleware/barcode.middleware");
const uuid = require("uuid").v4;
const barcodeService = require("../services/barcode.service");

// routes
const setUUID = (req, res, next) => {
  req.batchId = uuid();
  next();
};

router.get("/", authorize([Role.Admin, Role.SubAdmin]), barcodeService.findAll);
router.post("/verify", authorize([Role.SubAdmin]), verifySchema, barcodeService.verify);
router.post("/create", setUUID, barcodeService.createCode);
router.post("/upload", authorize([Role.SubAdmin]), setUUID, upload.single("file"), barcodeService.upload);
router.get("/export", authorize([Role.Admin, Role.SubAdmin]), barcodeService.download);
router.get("/report", authorize([Role.Admin, Role.Customer]), qsSchema, barcodeService.report);
router.delete("/:code", authorize([Role.SubAdmin]), barcodeService.deleteCode);

module.exports = router;

function verifySchema(req, res, next) {
  const schema = Joi.object({
    barcode: Joi.string().required()
  });
  validateRequest(req, next, schema);
}

function qsSchema(req, res, next) {
  const schema = Joi.object({
    start: Joi.string().required(),
    end: Joi.string().required(),
    customerId: Joi.string()
  });
  validateQueryString(req, next, schema);
}
