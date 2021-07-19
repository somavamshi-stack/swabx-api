const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validateRequest = require("../_middleware/validate-request");
const authorize = require("../_middleware/authorize");
const Role = require("../_helpers/role");
const accountService = require("../services/account.service");
const timeParser = require("parse-duration");
const moment = require("moment");
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
const REFRESH_TOKEN_EXPIRY = (process.env.REFRESH_TOKEN_EXPIRY && timeParser(process.env.REFRESH_TOKEN_EXPIRY)) || timeParser("3h");

// routes
router.post("/authenticate", authenticateSchema, authenticate);
router.post("/refresh-token", refreshTokenMW);
router.post("/revoke-token", authorize(), revokeTokenSchema, revokeToken);
router.post("/register", registerSchema, register);
router.post("/verify-email", verifyEmailSchema, verifyEmail);
router.post("/change-password", authorize(), changePasswordSchema, changePassword);
router.post("/forgot-password", forgotPasswordSchema, forgotPassword);
router.post("/validate-reset-token", validateResetTokenSchema, validateResetToken);

router.post("/reset-password", resetPasswordSchema, resetPassword);
router.get("/role/:role", authorize(Role.Admin), getAllByRole);
router.get("/", authorize(Role.Admin), getAll);

router.get("/:id", authorize(), getById);
router.post("/", authorize([Role.Admin]), createSchema, create);
router.put("/:id", authorize(), updateSchema, update);

module.exports = router;

function authenticateSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });
  validateRequest(req, next, schema);
}

function authenticate(req, res) {
  const { email, password } = req.body;
  const ipAddress = req.ip;
  accountService
    .authenticate({
      email,
      password,
      ipAddress,
      userAgent: req.headers["user-agent"]
    })
    .then(({ refreshToken, ...account }) => {
      setTokenCookie(res, refreshToken);
      res.json({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        isVerified: account.isVerified,
        jwtToken: account.jwtToken,
        refreshToken
      });
    })
    .catch((err) => {
      res.status(400).send({ message: err.message });
    });
}

function refreshTokenMW(req, res) {
  const token = req.cookies.refreshToken;
  if (token == null) {
    return res.status(401).json({ message: "Token Not Valid" });
  }
  const ipAddress = req.ip;
  accountService
    .refreshToken({ token, ipAddress })
    .then(({ refreshToken, ...account }) => {
      setTokenCookie(res, refreshToken);
      res.json({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        isVerified: account.isVerified,
        jwtToken: account.jwtToken,
        refreshToken
      });
    })
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function revokeTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().empty("")
  });
  validateRequest(req, next, schema);
}

function revokeToken(req, res) {
  // accept token from request body or cookie
  const token = req.body.token || req.cookies.refreshToken;
  const ipAddress = req.ip;

  if (!token) return res.status(400).json({ message: "Token is required" });

  // users can revoke their own tokens and admins can revoke any tokens
  if (!req.user.ownsToken(token) && req.user.role !== Role.Admin) {
    return res.status(401).json({ message: "Unauthorized to Revoke" });
  }

  accountService
    .revokeToken({ token, ipAddress })
    .then(() => res.json({ message: "Token revoked" }))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function registerSchema(req, res, next) {
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
      .messages({ "any.only": "Confirm Password does not match" }),
    acceptTerms: Joi.boolean().valid(true)
  });
  validateRequest(req, next, schema);
}

function register(req, res) {
  accountService
    .register(req.body)
    .then((result) => {
      res.json({
        message: "Registration successful, please check your email for verification instructions"
      });
    })
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function verifyEmailSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function verifyEmail(req, res) {
  accountService
    .verifyEmail(req.body)
    .then(() => res.json({ message: "Verification successful, you can now login" }))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function changePasswordSchema(req, res, next) {
  const schema = Joi.object({
    oldPassword: Joi.string().min(8).required(),
    password: Joi.string().min(8).regex(PASSWORD_REGEX).rule(PASSWORD_RULE),
    confirmPassword: Joi.any()
      .equal(Joi.ref("password"))
      .required()
      .label("Confirm password")
      .messages({ "any.only": "Confirm Password does not match" })
  });
  validateRequest(req, next, schema);
}

function changePassword(req, res) {
  if (req.body.oldPassword === req.body.password) {
    return res.status(400).json({
      message: "New password cannot be same as old password"
    });
  }
  accountService
    .changePassword(req.user.id, req.body)
    .then(() =>
      res.send({
        message: "Password changed successfully, you can now login with the new password"
      })
    )
    .catch((err) => {
      res.status(500).send({ message: err });
    });
}

function forgotPasswordSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function forgotPassword(req, res) {
  accountService
    .forgotPassword(req.body)
    .then(() =>
      res.json({
        message: "Please check your email for password reset instructions"
      })
    )
    .catch((err) => {
      res.status(500).send({ message: "Please check your email for password reset instructions" });
    });
}

function validateResetTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function validateResetToken(req, res) {
  accountService
    .validateResetToken(req.body)
    .then(() => res.json({ message: "Token is valid" }))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function resetPasswordSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    token: Joi.string().required(),
    password: Joi.string().min(8).regex(PASSWORD_REGEX).rule(PASSWORD_RULE),
    confirmPassword: Joi.any()
      .equal(Joi.ref("password"))
      .required()
      .label("Confirm password")
      .messages({ "any.only": "Confirm Password does not match" })
  });
  validateRequest(req, next, schema);
}

function resetPassword(req, res) {
  accountService
    .resetPassword(req.body)
    .then(() => res.json({ message: "Password reset successful, you can now login" }))
    .catch(() => res.status(400).json({ message: "Please enter valid token" }));
}

function getAll(req, res) {
  accountService
    .getAll()
    .then((accounts) => res.json(accounts))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function getAllByRole(req, res) {
  accountService
    .getAllByRole(req, res)
    .then((accounts) => {
      res.json(accounts);
    })
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function getById(req, res) {
  // users can get their own account and admins can get any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  accountService
    .getById(req.params.id)
    .then((account) => (account ? res.json(account) : res.sendStatus(404)))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function createSchema(req, res, next) {
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
      .messages({ "any.only": "Confirm Password does not match" }),
    role: Joi.string().valid(Role.Admin, Role.Customer, Role.SubAdmin).required()
  });
  validateRequest(req, next, schema);
}

function create(req, res) {
  req.body.activationDt = moment(new Date().getTime()).format("YYYY-MM-DD hh:mm:ss");
  req.body.expiryDt = moment().add(10, "y").format("YYYY-MM-DD hh:mm:ss");
  accountService
    .create(req.body, req.user.id)
    .then((account) => res.json(account))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

function updateSchema(req, res, next) {
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

  // only admins can update role
  if (req.user.role === Role.Admin || req.user.role === Role.Customer) {
    schemaRules.role = Joi.string().valid(Role.Admin, Role.Customer, Role.Staff).empty("");
  }

  const schema = Joi.object(schemaRules).with("password", "confirmPassword");
  validateRequest(req, next, schema);
}

function update(req, res) {
  // users can update their own account and admins can update any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  accountService
    .update(req.params.id, req.body, req.user.id, req.user.role)
    .then((account) => res.json(account))
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
}

// helper functions
function setTokenCookie(res, token) {
  // create cookie with refresh token that expires in 7 days
  const cookieOptions = {
    httpOnly: process.env.NODE_ENV === "production",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY)
  };
  res.cookie("refreshToken", token, cookieOptions);
}
