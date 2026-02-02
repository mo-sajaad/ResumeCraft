// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyAXXAFFH-lsPa12HbRSfS8OTPD-KrWeX3Y",
  authDomain: "resumecraft-4a63e.firebaseapp.com",
  projectId: "resumecraft-4a63e",
  storageBucket: "resumecraft-4a63e.firebasestorage.app",
  messagingSenderId: "621632190205",
  appId: "1:621632190205:web:05245366ddcdae28a8f094",
  measurementId: "G-4MPFSVEVJ4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);