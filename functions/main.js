const coreFunctions = require('./index');
const dailySummaryPush = require('./daily-summary-push');

Object.assign(exports, coreFunctions);
exports.getDailySummaryEmailSettings = dailySummaryPush.getDailySummaryEmailSettings;
exports.setDailySummaryEmailSettings = dailySummaryPush.setDailySummaryEmailSettings;
exports.sendDailySummaryEmails = dailySummaryPush.sendDailySummaryEmails;
