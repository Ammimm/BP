const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const rateLimiter = require('../middleware/rateLimiter');
const { handleAirQualityRequest, handleLocationsRequest } = require('../utils/utils');


router.get('/airquality', authenticateToken, rateLimiter, handleAirQualityRequest);
router.get('/locations', authenticateToken, handleLocationsRequest);


module.exports = router;



