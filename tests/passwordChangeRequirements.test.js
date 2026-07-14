const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldRequireOldPasswordForPasswordChange } = require('../controllers/authController');

test('requires old password for password-based accounts', () => {
  assert.equal(shouldRequireOldPasswordForPasswordChange({ auth_provider: 'password', password_set: true }), true);
  assert.equal(shouldRequireOldPasswordForPasswordChange({ auth_provider: 'password', password_set: undefined }), true);
});

test('does not require old password for Google or phone sign-up accounts', () => {
  assert.equal(shouldRequireOldPasswordForPasswordChange({ auth_provider: 'google', password_set: false }), false);
  assert.equal(shouldRequireOldPasswordForPasswordChange({ auth_provider: 'phone', password_set: false }), false);
});
