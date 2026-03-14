/**
 * @typedef {Object} AdminServiceContract
 * @property {(firebaseUid:string)=>boolean} isAdminUid
 * @property {()=>Promise<Array>} listFeatureFlags
 * @property {(input:{key:string,description?:string,enabled:boolean,rolloutPercent?:number})=>Promise<any>} upsertFeatureFlag
 * @property {(input:{days?:number})=>Promise<Array>} getUsageSummary
 * @property {(input:{limit?:number})=>Promise<Array>} getAuditLogs
 */

module.exports = {};
