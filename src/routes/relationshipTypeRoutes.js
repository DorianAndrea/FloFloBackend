const express = require("express");

const {
  getRelationshipTypes,
} = require("../controllers/relationshipTypeController");

const router = express.Router();

router.get("/", getRelationshipTypes);

module.exports = router;