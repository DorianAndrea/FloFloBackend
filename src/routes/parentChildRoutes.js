const express = require("express");
const router = express.Router();

const {
  getChildrenByParent,
  linkChildToParent
} = require("../controllers/parentChildController");

router.get("/:parentId/children", getChildrenByParent);
router.post("/:parentId/children", linkChildToParent);

module.exports = router;