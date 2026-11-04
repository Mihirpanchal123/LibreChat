const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  generateCheckAccess,
  createUsageHandlers,
  createUsageAccessHandler,
} = require('@librechat/api');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
const handlers = createUsageHandlers({
  getUsageByUser: db.getUsageByUser,
  getUserUsageByModel: db.getUserUsageByModel,
});
const checkUsageUse = generateCheckAccess({
  permissionType: PermissionTypes.USAGE,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

router.use(requireJwtAuth);
/** A user's own usage needs the role's USAGE permission, not the all-users capability. */
router.get('/me', checkUsageUse, handlers.getMyUsage);

router.use(requireCapability(SystemCapabilities.READ_USAGE));
router.get('/access', createUsageAccessHandler());
router.get('/', handlers.listUsage);
router.get('/users/:userId', handlers.getUserUsage);

module.exports = router;
