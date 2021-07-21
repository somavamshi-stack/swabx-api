const Router = require("express").Router();

Router.use("/accounts", require("./accounts.controller"));

Router.use("/customer", require("./customer.controller"));

Router.use("/barcode", require("./barcode.controller"));

Router.use("/bc", require("./blockchain.controller"));

Router.use("/appointment", require("./appointment.controller"));

module.exports = Router;
