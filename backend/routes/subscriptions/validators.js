const { body, validationResult } = require('express-validator');

const validateCheckout = [
  body('plan_id')
    .isInt({ min: 1 })
    .withMessage('plan_id must be a valid positive integer'),
];

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

module.exports = {
  validateCheckout,
  checkValidation
};