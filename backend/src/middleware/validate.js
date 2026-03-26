// src/middleware/validate.js
/**
 * Wraps express-validator's validationResult into a clean middleware.
 * Usage:  router.post('/route', [...validators], validate, handler)
 */
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({
        field:   e.path,
        message: e.msg,
        value:   e.value,
      })),
    });
  }
  next();
};

module.exports = { validate };
