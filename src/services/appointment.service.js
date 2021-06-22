const logger = require("../utils/logger");
const sendRequest = require("./appointment.request");

const APPOINTMENTS = "/schedules";

async function listAvailableSlots(req, res) {
  try {
    const location = await db.Location.findOne({
      where: { id: req.query.locationid }
    });
    if (location == null) {
      return res.status(400).send({ _msg: "Location is not identified by System", _status: 400 });
    }
    req.query.customerid = location.accountId;

    const response = await sendRequest(APPOINTMENTS + "/availableslots", "GET", req.query, req.body);
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in listAppointments", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function listAppointments(req, res) {
  try {
    const location = await db.Location.findOne({
      where: { id: req.query.locationid }
    });
    if (location == null) {
      return res.status(400).send({ _msg: "Location is not identified by System", _status: 400 });
    }
    req.query.customerid = location.accountId;

    const response = await sendRequest(APPOINTMENTS, "GET", req.query, req.body);
    if (response.statusCode == 200) {
      let data = [];
      for (let i = 0; i < response.body.data.length; i++) {
        let rec = response.body.data[i];
        if (rec.status == "Upcoming") {
          let patient = await db.Account.findOne({ where: { id: rec.patientid } });
          if (patient != null) {
            rec.patient = patient.name;
          } else {
            rec.patient = "Anonymous";
          }
          rec.status = "Pending";
        }
        data.push(rec);
      }
      response.body.data = data;
    }
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in listAppointments", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function myAppointments(req, res) {
  try {
    const locations = await db.Location.findAll();
    const response = await sendRequest(APPOINTMENTS + "/patient/" + req.user.id, "GET", {}, req.body);
    if (response.statusCode == 200) {
      let result = [];
      response.body.data &&
        response.body.data.forEach((element) => {
          delete element.customerid;
          delete element.patientid;
          delete element.s_id;
          let location = locations.find((e) => e.id === element.locationid);
          if (location) element.location = location.location;
          result.push(element);
        });
      response.body.data = result;
    }
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in myAppointments", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function myUpcomingAppointment(req, res) {
  try {
    const response = await sendRequest(APPOINTMENTS + "/patient/" + req.user.id + "/upcoming", "GET", {}, req.body);
    if (response.body && response.body.data) {
      const location = await db.Location.findOne({
        where: { id: response.body.data.locationid }
      });
      if (location != null) {
        delete response.body.data.customerid;
        delete response.body.data.patientid;
        delete response.body.data.s_id;
        response.body.data.location = location.location;
      }
    }
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in myAppointments", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function bookAppointment(req, res) {
  try {
    const location = await db.Location.findOne({
      where: { id: req.body.locationid }
    });
    if (location == null) {
      return res.status(400).send({ _msg: "Location is not identified by System", _status: 400 });
    }
    req.body.customerid = location.accountId;
    req.body.patientid = req.user.id;
    const response = await sendRequest(APPOINTMENTS, "POST", null, req.body);
    if (response.body && response.body._status == 500 && response.body._msg.endsWith("undefined")) {
      return res.status(404).send({ _status: 404, _msg: "Failed to book an appointment" });
    }
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in bookAppointment", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function cancelAppointment(req, res) {
  try {
    req.body.patientid = req.user.id;
    const response = await sendRequest(APPOINTMENTS + "/" + req.body.appointmentID + "/cancel", "POST", null, req.body);
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in cancelAppointment", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

async function updateAppointmentStatus(req, res) {
  try {
    req.body.staffId = req.user.id;
    const response = await sendRequest(APPOINTMENTS + "/update_status", "POST", null, req.body);
    res.status(response.statusCode).json(response.body);
  } catch (error) {
    logger.error("Exception occured in cancelAppointment", error);
    res.status(500).send({
      _status: 500,
      _msg: "External service is not responding"
    });
  }
}

module.exports = {
  listAppointments,
  listAvailableSlots,
  bookAppointment,
  cancelAppointment,
  myAppointments,
  myUpcomingAppointment,
  updateAppointmentStatus
};
