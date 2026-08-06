const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');

// Allow only 'crafter' role or admin/super_admin
const crafterCheck = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const role = req.user.role;
  if (role === 'crafter' || role === 'admin' || role === 'super_admin') return next();
  return res.status(403).json({ error: 'Crafter access required.' });
};

router.use(authenticateToken);
router.use(crafterCheck);

// Expose a limited set of endpoints used by the visual editor
router.get('/settings', adminController.getSiteSettings);
router.post('/settings', adminController.updateSiteSettings);

router.get('/homepage-sections', adminController.getAllHomepageSections);
router.post('/homepage-sections', adminController.createHomepageSection);
router.put('/homepage-sections/:id', adminController.updateHomepageSection);
router.delete('/homepage-sections/:id', adminController.deleteHomepageSection);

// Allow lightweight product updates (title/description/visibility/ordering)
router.put('/products/:id', adminController.updateProduct);

module.exports = router;
