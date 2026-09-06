Object.assign(exports, require('./index'));

if (process.env.TWINLY_EMAIL_DELIVERY_ENABLED === 'true') {
  Object.assign(exports, require('./email-delivery'));
}
