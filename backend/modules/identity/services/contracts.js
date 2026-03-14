/**
 * @typedef {Object} IdentityServiceContract
 * @property {(firebaseUid:string,email:string,fullName?:string|null)=>Promise<any>} findOrCreateUser
 * @property {(firebaseUid:string)=>Promise<any>} getUserByFirebaseUid
 * @property {(firebaseUid:string)=>Promise<number|null>} incrementTokenVersion
 * @property {(firebaseUid:string)=>Promise<any>} getUserProfileByFirebaseUid
 * @property {(firebaseUid:string,prefs:{weeklyInsights?:boolean,jobAlerts?:boolean})=>Promise<any>} updateUserPreferences
 */

module.exports = {};
