const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validateRequest = require("../_middleware/validate-request");
const authorize = require("../_middleware/authorize");
const Role = require("../_helpers/role");
const accountService = require("../services/account.service");
const timeParser = require("parse-duration");
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

function authenticate(req, res, next) {
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
    .catch(next);
}

function refreshTokenMW(req, res, next) {
  const token = req.cookies.refreshToken;
  if (token == null) {
    return res.status(401).json({ message: "token_not_valid" });
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
    .catch(next);
}

function revokeTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().empty("")
  });
  validateRequest(req, next, schema);
}

function revokeToken(req, res, next) {
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
    .catch(next);
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

function register(req, res, next) {
  accountService
    .register(req.body)
    .then((result) => {
      if (result) {
        res.json({
          message: "Registration successful, please check your email for verification instructions"
        });
      } else {
        res.json({
          message:
            "email id is already registered, please check your mail. \nIncase forgotten password click on Forgot Password to reset your account password."
        });
      }
    })
    .catch(next);
}

function verifyEmailSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function verifyEmail(req, res, next) {
  accountService
    .verifyEmail(req.body)
    .then(() => res.json({ message: "Verification successful, you can now login" }))
    .catch(next);
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

function changePassword(req, res, next) {
  if (req.body.oldPassword == req.body.password) {
    return res.status(400).json({
      message: "New password cannot be same as old password"
    });
  }
  accountService
    .changePassword(req.user.id, req.body)
    .then(() =>
      res.json({
        message: "Password changed successfully, you can now login with the new password"
      })
    )
    .catch(next);
}

function forgotPasswordSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function forgotPassword(req, res, next) {
  accountService
    .forgotPassword(req.body)
    .then(() =>
      res.json({
        message: "Please check your email for password reset instructions"
      })
    )
    .catch(next);
}

function validateResetTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}

function validateResetToken(req, res, next) {
  accountService
    .validateResetToken(req.body)
    .then(() => res.json({ message: "Token is valid" }))
    .catch(next);
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

function resetPassword(req, res, next) {
  accountService
    .resetPassword(req.body)
    .then(() => res.json({ message: "Password reset successful, you can now login" }))
    .catch(() => res.status(400).json({ message: "Please enter valid token" }));
}

function getAll(req, res, next) {
  accountService
    .getAll()
    .then((accounts) => res.json(accounts))
    .catch(next);
}

function getAllByRole(req, res, next) {
  accountService
    .getAllByRole(req, res)
    .then((accounts) => {
      res.json(accounts);
    })
    .catch(next);
}

function getById(req, res, next) {
  // users can get their own account and admins can get any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  accountService
    .getById(req.params.id)
    .then((account) => (account ? res.json(account) : res.sendStatus(404)))
    .catch(next);
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

function create(req, res, next) {
  accountService
    .create(req.body, req.user.id)
    .then((account) => res.json(account))
    .catch(next);
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

function update(req, res, next) {
  // users can update their own account and admins can update any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  accountService
    .update(req.params.id, req.body, req.user.id, req.user.role)
    .then((account) => res.json(account))
    .catch(next);
}

function _delete(req, res, next) {
  // users can delete their own account and admins can delete any account
  if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin && req.user.role !== Role.Customer) {
    return res.status(401).json({ message: "Unauthorized to Delete Account" });
  }

  accountService
    .delete(req.params.id, req.user.id)
    .then(() => res.json({ message: "Account deleted successfully" }))
    .catch(next);
}

// helper functions

function setTokenCookie(res, token) {
  // create cookie with refresh token that expires in 7 days
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY)
  };
  res.cookie("refreshToken", token, cookieOptions);
}
