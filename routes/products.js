const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');

// Public routes
router.get('/', productController.getAllProducts);
router.get('/categories', productController.getAllCategories);
router.get('/homepage-sections', productController.getHomepageSections);
router.get('/settings', productController.getSiteSettings);
router.get('/search-suggestions', productController.getSearchSuggestions);
router.get('/carousel', productController.getCarouselProducts);
router.get('/category/:id', productController.getProductsByCategory);
router.get('/:id/ratings', productController.getProductRatings);
router.post('/:id/rating', authenticateToken, productController.submitProductRating);
router.get('/:id', productController.getProductById);

module.exports = router;
