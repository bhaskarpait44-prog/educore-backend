'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Standard API limiter to prevent general abuse
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    errors: ['Rate limit exceeded'],
  },
});

/**
 * Stricter limiter for authentication routes (Login, Forgot Password, etc.)
 * to protect against brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 login attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after an hour.',
    errors: ['Brute-force protection triggered'],
  },
  skipSuccessfulRequests: true, // Only count failed attempts towards the limit
});

module.exports = {
  apiLimiter,
  authLimiter,
};
