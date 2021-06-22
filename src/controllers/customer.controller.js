const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validateRequest = require("../_middleware/validate-request");
const authorize = require("../_middleware/authorize");
const Role = require("../_helpers/role");
const accountService = require("../services/account.service");
const locationService = require("../services/location.service");
const barcodeService = require("../services/barcode.service");
const logger = require("../utils/logger");
const NAME_REGEX = /^[a-zA-Z0-9_ ]{4,25}$/;
const NAME_RULE = {
  message:
    "Filed 'name' can contain lowercase/uppercase alphabetical characters, numeric characters and space. Mininum of 8 characters. Maxinum of 25 characters."
};
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
const PASSWORD_RULE = {
  message:
    "Password must contain \n\t*. at least 1 lowercase alphabetical character.\n\t*. at least 1 uppercase alphabetical character.\n\t*. at least 1 numeric character.\n\t*. at least one special character !@#$%^&\n\t*. Mininum of 8 characters"
};

// Staff routes
router.get("/staff", authorize([Role.Customer]), getAllStaff);
router.post("/staff", authorize([Role.Customer]), createStaffSchema, createStaff);
router.get("/staff/:id", authorize([Role.Customer]), getStaffById);
router.put("/staff/:id", authorize([Role.Customer]), updateStaffSchema, updateStaff);
router.delete("/staff/:id", authorize([Role.Customer]), _deleteStaff);

// Location routes

router.get("/location/:id", authorize([Role.Customer]), getLocationById);
router.post("/location/", authorize([Role.Customer]), createLocation);
router.put("/location/:id", authorize([Role.Customer]), updateLocation);
router.delete("/location/:id", authorize([Role.Customer]), _deleteLocation);
router.get("/locations", authorize([Role.Customer]), getAllLocations);
router.get("/locations/all", authorize([Role.Admin, Role.Staff, Role.Patient]), getAllLocationsCust);
router.get("/usage-report", authorize([Role.Customer]), barcodeService.customerUsageReport);
router.get("/staff-usage-report", authorize([Role.Staff]), barcodeService.staffUsageReport);

module.exports = router;

function _deleteStaff(req, res, next) {
  // users can delete their own account and admins can delete any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized to Delete Account" });
  }

  accountService
    .delete(req.params.id, req.user.id)
    .then(() => res.json({ message: "Account deleted successfully" }))
    .catch(next);
}

function updateStaffSchema(req, res, next) {
  const schemaRules = {
    name: Joi.string().min(4).regex(NAME_REGEX).rule(NAME_RULE),
    email: Joi.string().email().required(),
    contact: Joi.string(),
    country: Joi.string(),
    password: Joi.string().min(8).regex(PASSWORD_REGEX).rule(PASSWORD_RULE),
    confirmPassword: Joi.any()
      .equal(Joi.ref("password"))
      .required()
      .label("Confirm password")
      .messages({ "any.only": "Confirm Password does not match" })
  };

  // // only admins or customers can update role
  // if (req.user.role === Role.Admin || req.user.role === Role.Customer) {
  //   schemaRules.role = Joi.string().valid(Role.Admin, Role.User).empty("");
  // }

  const schema = Joi.object(schemaRules).with("password", "confirmPassword");
  validateRequest(req, next, schema);
}

function updateStaff(req, res, next) {
  // staff can update their own account and admins and customer can update any staff
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized 3" + req.user.role });
  }

  accountService
    .update(req.params.id, req.body, req.user.id, req.user.role)
    .then((account) => res.json(account))
    .catch(next);
}

function createStaffSchema(req, res, next) {
  const schema = Joi.object({
    name: Joi.string().min(4).regex(NAME_REGEX).rule(NAME_RULE),
    email: Joi.string().email().required(),
    contact: Joi.string(),
    country: Joi.string(),
    password: Joi.string().min(8).regex(PASSWORD_REGEX).rule(PASSWORD_RULE),
    confirmPassword: Joi.any()
      .equal(Joi.ref("password"))
      .required()
      .label("Confirm password")
      .messages({ "any.only": "Confirm Password does not match" })
  });
  validateRequest(req, next, schema);
}

function createStaff(req, res, next) {
  req.body.role = Role.Staff;
  accountService
    .create(req.body, req.user.id)
    .then((account) => res.json(account))
    .catch(next);
}

function getAllStaff(req, res, next) {
  accountService
    .getAll(req.user.id)
    .then((accounts) => res.json(accounts))
    .catch(next);
}

function getStaffById(req, res, next) {
  // users can get their own account and admins can get any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  accountService
    .getById(req.params.id, req.user.id)
    .then((account) => (account ? res.json(account) : res.sendStatus(404)))
    .catch(next);
}

// Locations
function getAllLocations(req, res, next) {
  logger.info(`getAllLocations[req.user.id: ${req.user.id}]`);
  locationService
    .getAll(req.user.id)
    .then((locations) => res.json(locations))
    .catch(next);
}

function getAllLocationsCust(req, res, next) {
  logger.info(`getAllLocations[req.params.customerId: ${req.params.customerId}]`);
  if (req.user.role == Role.Staff) {
    locationService
      .getAll(req.user.customerId)
      .then((locations) => res.json(locations))
      .catch(next);
  } else {
    locationService
      .getAll()
      .then((locations) => res.json(locations))
      .catch(next);
  }
}

function getLocationById(req, res, next) {
  // users can get their own customer and admins can get any customer
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  locationService
    .getById(req.params.id, req.user.id)
    .then((location) => (location ? res.json(location) : res.sendStatus(404)))
    .catch(next);
}

function createOrUpdateSchema(req, res, next) {
  const schema = Joi.object({
    location: Joi.string().required(),
    slot_config: Joi.object().optional()
  });
  validateRequest(req, next, schema);
}

function createLocation(req, res, next) {
  // have to pass customer id from params.
  locationService
    .create(req.body, req.user.id)
    .then((location) => res.json(location))
    .catch(next);
}

function updateLocation(req, res, next) {
  // users can update their own location and admins can update any location
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  locationService
    .update(req.params.id, req.body, req.user.id)
    .then((location) => res.json(location))
    .catch(next);
}

function _deleteLocation(req, res, next) {
  locationService
    .delete(req.params.id, req.user.id)
    .then(() => res.json({ message: "Location deleted successfully" }))
    .catch(next);
}
