const file = "config_production.json";
const config = require("../../" + file);
const nodemailer = require("nodemailer");
const path = require("path");
const EmailTemplates = require("swig-email-templates");
const templates = new EmailTemplates({
  root: path.join(__dirname, "templates")
});
const transport = nodemailer.createTransport(config.smtpOptions);

module.exports = sendMailTemplate;

function sendMailTemplate(to, templateName, context, subject) {
  context.customer = process.env.CLIENT_NAME || "SwabX";
  context.PUBLIC_URL = "https://swabx.healthx.global";
  let mailOptions;
  return new Promise(function (resolve, reject) {
    templates.render(templateName, context, function (err, html, text) {
      mailOptions = {
        from: context.customer + " <" + config.from + ">",
        to: to,
        html: html,
        body: "Hello",
        text: text,
        subject: subject
      };

      // verify connection configuration
      transport.verify(function (error1) {
        if (error1) {
          console.error("Error in verifying mail credentials: ", error1);
          return reject(error1);
        } else {
          // sending email
          transport.sendMail(mailOptions, function (error, res) {
            if (error) {
              console.error("Mail sending failed: " + error);
              return resolve(false);
            } else {
              return resolve(true);
            }
          });
        }
      });
    });
  });
}
