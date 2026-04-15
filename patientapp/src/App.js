import { Auth } from './components/Auth';
import { Homepage } from './components/Homepage';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase-config';
import './App.css';

import Cookies from 'universal-cookie';
const cookies = new Cookies();

function App() {
  const [isAuth, setIsAuth] = useState(cookies.get("auth-token"));
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [doctorEmail, setDoctorEmail] = useState(null);
  const [doctorError, setDoctorError] = useState('');

  const doctorInputRef = useRef();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuth(Boolean(user));
      setIsAuthReady(true);

      if (!user) {
        setDoctorEmail(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const signUserOut = async () => {
    await signOut(auth)
    cookies.remove("auth-token");
    setIsAuth(false);
    setDoctorEmail(null);
  }

  const handleDoctorSubmit = () => {
    const submittedEmail = doctorInputRef.current?.value?.trim().toLowerCase();

    if (!submittedEmail) {
      setDoctorError('Enter your physiotherapist email.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(submittedEmail)) {
      setDoctorError('Use a valid email address.');
      return;
    }

    setDoctorError('');
    setDoctorEmail(submittedEmail);
  };

  if (!isAuthReady) {
    return (
      <div className="App">
        <div className="doctor">
          <div className="doctor-card">
            <p className="doctor-eyebrow">Loading</p>
            <h1>Restoring your session</h1>
            <p className="doctor-copy">
              We are reconnecting to Firebase authentication before loading your live exercise data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="App">
        <Auth setIsAuth={setIsAuth}/>
      </div>
    );
  }

  return (
    <div>
      {doctorEmail ? (
        <Homepage
          currentUser={currentUser}
          doctorEmail={doctorEmail}
          setDoctorEmail={setDoctorEmail}
        />
      ) : (
        <div className='doctor'>
          <div className="doctor-card">
            <p className="doctor-eyebrow">Rehab Setup</p>
            <h1>Connect to your physiotherapist</h1>
            <p className="doctor-copy">
              Enter the physiotherapist or clinic email that should be able to review your knee rehabilitation progress.
            </p>
            <label htmlFor="doctor-email">Physiotherapist email</label>
            <input
              id="doctor-email"
              className='doctor-name'
              ref={doctorInputRef}
              placeholder="physio@hospital.com"
              type="email"
            />
            {doctorError ? <p className="doctor-error">{doctorError}</p> : null}
            <div className='buttons'>
              <button className='submit-doctor' onClick={handleDoctorSubmit}>Continue</button>
              <button className='sign-out' onClick={signUserOut}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
