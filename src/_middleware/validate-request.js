module.exports = validateRequest;
module.exports.validateQueryString = validateQueryString;
module.exports.validateParamString = validateParamString;

function validateRequest(req, next, schema) {
  const options = {
    abortEarly: false, // include all errors
    allowUnknown: true, // ignore unknown props
    stripUnknown: true // remove unknown props
  };
  const { error, value } = schema.validate(req.body, options);
  if (error) {
    next(`${error.details.map((x) => x.message).join(", ")}`);
  } else {
    req.body = value;
    next();
  }
}

function validateQueryString(req, next, schema) {
  const options = {
    abortEarly: false, // include all errors
    allowUnknown: true, // ignore unknown props
    stripUnknown: true // remove unknown props
  };
  const { error, value } = schema.validate(req.query, options);
  if (error) {
    next(`${error.details.map((x) => x.message).join(", ")}`);
  } else {
    req.query = value;
    next();
  }
}

function validateParamString(req, next, schema) {
  const options = {
    abortEarly: false, // include all errors
    allowUnknown: true, // ignore unknown props
    stripUnknown: true // remove unknown props
  };
  const { error, value } = schema.validate(req.params, options);
  if (error) {
    next(`${error.details.map((x) => x.message).join(", ")}`);
  } else {
    req.params = value;
    next();
  }
}
