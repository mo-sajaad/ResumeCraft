/**
 * @typedef {Object} BillingServiceContract
 * @property {(userId:string)=>Promise<any>} getActiveSubscription
 * @property {(userId:string,type:'resume'|'cover_letter')=>Promise<{allowed:boolean,plan:any}>} checkLimit
 * @property {(userId:string,type:'resume'|'cover_letter')=>Promise<void>} trackUsage
 * @property {(userId:string)=>Promise<string|null>} getLatestStripeCustomerId
 */

module.exports = {};
