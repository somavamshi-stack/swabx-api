const express = require("express");
const router = express.Router();
const Joi = require("joi");
const authorize = require("../_middleware/authorize");
const Role = require("../_helpers/role");
const validateRequest = require("../_middleware/validate-request");
const validateQueryString = validateRequest.validateQueryString;
const appointmentService = require("../services/appointment.service");

router.get("/location-appointments", authorize([Role.Staff]), listSchema, appointmentService.listAppointments);

router.get("/check-slots", authorize([Role.Patient]), listSchema, appointmentService.listAvailableSlots);
router.get("/my-appointments", authorize([Role.Patient]), appointmentService.myAppointments);
router.get("/my-upcoming-appointment", authorize([Role.Patient]), appointmentService.myUpcomingAppointment);
router.post("/book-appointment", authorize([Role.Patient]), bookSchema, appointmentService.bookAppointment);
router.post("/cancel-appointment", authorize([Role.Patient]), aidSchema, appointmentService.cancelAppointment);
router.post("/update-status", authorize([Role.Staff]), aidSchema, appointmentService.updateAppointmentStatus);

module.exports = router;

function listSchema(req, res, next) {
  const schema = Joi.object({
    locationid: Joi.string().required(),
    date: Joi.string().optional()
  });
  validateQueryString(req, next, schema);
}

function bookSchema(req, res, next) {
  const schema = Joi.object({
    locationid: Joi.string().required(),
    slot_at: Joi.string(),
    slot_date: Joi.string(),
    s_id: Joi.string().optional()
  });
  validateRequest(req, next, schema);
}

function aidSchema(req, res, next) {
  const schema = Joi.object({
    appointmentID: Joi.string().required(),
    status: Joi.string().optional()
  });
  validateRequest(req, next, schema);
}
