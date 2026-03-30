import { Auth } from './components/Auth';
import { Homepage } from './components/Homepage';
import { useState, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase-config';
import './App.css';

import Cookies from 'universal-cookie';
const cookies = new Cookies();

function App() {
  const [isAuth, setIsAuth] = useState(cookies.get("auth-token"));
  const [doctorEmail, setDoctorEmail] = useState(null);
  const [doctorError, setDoctorError] = useState('');

  const doctorInputRef = useRef();

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
        <Homepage doctorEmail={doctorEmail} setDoctorEmail={setDoctorEmail}/>
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
