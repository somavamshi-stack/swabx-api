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
const checkCSRF = require("../_middleware/checkCSRF");

// routes
const setUUID = (req, res, next) => {
  req.batchId = uuid();
  next();
};

router.get("/", checkCSRF, authorize([Role.Admin, Role.SubAdmin]), barcodeService.findAll);
router.post("/verify", checkCSRF, authorize([Role.SubAdmin]), verifySchema, barcodeService.verify);
router.post("/create", setUUID, barcodeService.createCode);
router.post("/upload", checkCSRF, authorize([Role.SubAdmin]), setUUID, upload.single("file"), barcodeService.upload);
router.get("/export", checkCSRF, authorize([Role.Admin, Role.SubAdmin]), barcodeService.download);
router.get("/report", checkCSRF, authorize([Role.Admin, Role.Customer]), qsSchema, barcodeService.report);
router.post("/:code/delete", checkCSRF, authorize([Role.SubAdmin]), barcodeService.deleteCode);

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
