import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDC1g4OFU-NI3fu89GfZov0W_5_QtMxeDc',
  authDomain: 'patientapp-1c5d4.firebaseapp.com',
  databaseURL: 'https://patientapp-1c5d4-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'patientapp-1c5d4',
  storageBucket: 'patientapp-1c5d4.firebasestorage.app',
  messagingSenderId: '980464205155',
  appId: '1:980464205155:web:7c89df602c3b9f72f82756',
  measurementId: 'G-CP9MKSWJDH'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
